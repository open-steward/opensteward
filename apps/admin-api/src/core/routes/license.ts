/**
 * GET /api/license — the deployment's license, as integration-server (the single
 * license authority, D-A) evaluates it and admin-api last read it
 * (core/license/status-cache.ts). Never the token: the upstream schema strips
 * every key it does not know.
 *
 * Admin role only, like the System page that shows it. Developer keys (`osk_`) and
 * end-user tokens (`eut_`) are integration-server credentials, and SCIM tokens are
 * valid only on /scim/v2. `authenticate` answers each of them 401, like any other
 * non-JWT.
 *
 * Adds what admin-api knows: `usage.tenants` (registered tenants, counting
 * 'default' — D-B), `graceEndsAt`, `stale` and `fetchedAt`. Before
 * integration-server has ever answered: 503 LICENSE_STATUS_UNAVAILABLE, naming
 * ADMIN_SECRET when that is the cause (P11).
 */
import type { FastifyInstance } from 'fastify'
import {
  GRACE_PERIOD_MS,
  LICENSE_ERROR_CODES,
  licenseErrorBody,
} from '@opensteward/shared/licensing'
import type { AdminStore } from '../db/admin-store'
import { unavailableReason, type LicenseStatusProvider } from '../license/status-cache'
import { LicenseStatus, dataEnvelope, errorBody } from './_openapi'

const TAG = 'license'

export function createLicenseRoutes(licenseStatus: LicenseStatusProvider, adminStore: AdminStore) {
  return async function licenseRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)
    fastify.addHook('preHandler', fastify.adminOnly)

    fastify.get(
      '/api/license',
      {
        schema: {
          tags: [TAG],
          summary: "The deployment's license status",
          description:
            'The license as integration-server evaluates it (state, who it is issued to, expiry, enabled features, limits and usage), as admin-api last read it — cached for a minute, served with `stale: true` while integration-server is not answering. Never contains the license token. Admin role required. 503 `LICENSE_STATUS_UNAVAILABLE` until integration-server has answered once; its message names `ADMIN_SECRET` when that is why.',
          operationId: 'license.get',
          response: {
            200: dataEnvelope(LicenseStatus),
            401: errorBody,
            403: errorBody,
            503: errorBody,
          },
        },
      },
      async (_request, reply) => {
        const { snapshot, failure } = await licenseStatus.get()
        if (!snapshot) {
          return reply
            .status(503)
            .send(
              licenseErrorBody(
                LICENSE_ERROR_CODES.STATUS_UNAVAILABLE,
                `The license status is not available: ${unavailableReason(failure)}. integration-server keeps enforcing the license on its own.`,
              ),
            )
        }
        const { status } = snapshot
        const tenants = (await adminStore.listTenants()).length
        const exp = status.expiresAt ? Date.parse(status.expiresAt) : Number.NaN
        return {
          data: {
            ...status,
            usage: { connections: status.usage.connections, tenants },
            ...(Number.isFinite(exp)
              ? { graceEndsAt: new Date(exp + GRACE_PERIOD_MS).toISOString() }
              : {}),
            stale: snapshot.stale,
            fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
          },
        }
      },
    )
  }
}
