/**
 * Developer-facing connections router.
 *
 *   GET    /v1/connections              list (filter ?vertical=, ?platform=)
 *   GET    /v1/connections/{id}         single
 *   PATCH  /v1/connections/{id}         label rename
 *   DELETE /v1/connections/{id}         revoke (does NOT call platform)
 *
 * Every endpoint is tenant-scoped via `requireTenantKey`. The deployment
 * tenant comes from the calling API key, and the connection's
 * `owner_tenant_id` column must match. Cross-tenant lookups return 404
 * (not 403) so the caller cannot probe for other tenants' connection ids.
 *
 * Scopes:
 *   - GETs require `connections:read`.
 *   - PATCH and DELETE require `connections:write`.
 */
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ApiKeyStore } from '../auth/api-keys'
import { CredentialStore, DuplicateLabelError } from '../auth/store'
import { assertScope, requireTenantKey, type RateLimitConfigSource } from './api-key-middleware'
import type { DeveloperCredentialOptions } from './credential-resolver'
import type { McpEnabledSource } from './api-key-middleware'
import type { UnifiedAdapterRegistry } from '../adapter/unified-registry'

export interface ConnectionsDevRouterOptions {
  apiKeys: ApiKeyStore
  credentials: CredentialStore
  rateLimit?: RateLimitConfigSource
  /** Live read of `features.mcp_enabled`; omit to always allow. */
  mcpEnabled?: McpEnabledSource
  /**
   * Accept OIDC bearer tokens beside `osk_` keys, and the live reads of the
   * two operator toggles. All optional — omit them and only API keys are
   * accepted.
   */
  oauth?: DeveloperCredentialOptions['oauth']
  apiKeysEnabled?: DeveloperCredentialOptions['apiKeysEnabled']
  oauthEnabled?: DeveloperCredentialOptions['oauthEnabled']
  /** Optional — enables best-effort unregisterWebhook on connection delete. */
  registry?: UnifiedAdapterRegistry
}

interface ListQuery {
  vertical?: string
  platform?: string
}

interface PatchBody {
  label?: string | null
}

function tenantOf(request: FastifyRequest): string {
  const tenantId = (request as unknown as { tenantId?: string }).tenantId
  if (!tenantId) throw new Error('tenantId middleware did not run')
  return tenantId
}

function notFound(reply: import('fastify').FastifyReply, id: string) {
  return reply.status(404).send({
    error: { code: 'CONNECTION_NOT_FOUND', message: `No connection with id ${id}.` },
  })
}

export function createConnectionsDevRouter(opts: ConnectionsDevRouterOptions): FastifyPluginAsync {
  const { apiKeys, credentials } = opts

  return async (fastify) => {
    fastify.addHook(
      'preHandler',
      requireTenantKey({
        apiKeys,
        oauth: opts.oauth,
        apiKeysEnabled: opts.apiKeysEnabled,
        oauthEnabled: opts.oauthEnabled,
        rateLimit: opts.rateLimit,
        mcpEnabled: opts.mcpEnabled,
      }),
    )

    fastify.get<{ Querystring: ListQuery }>('/v1/connections', async (request, reply) => {
      if (!(await assertScope(request, reply, 'connections:read'))) return
      const tenantId = tenantOf(request)
      const data = await credentials.listForOwner(tenantId, {
        vertical: request.query.vertical,
        platform: request.query.platform,
      })
      return reply.send({
        data,
        meta: { totalCount: data.length, fetchedAt: new Date().toISOString() },
      })
    })

    fastify.get<{ Params: { id: string } }>('/v1/connections/:id', async (request, reply) => {
      if (!(await assertScope(request, reply, 'connections:read'))) return
      const tenantId = tenantOf(request)
      const row = await credentials.getRowForOwner(tenantId, request.params.id)
      if (!row) return notFound(reply, request.params.id)
      return reply.send({ data: row, meta: { fetchedAt: new Date().toISOString() } })
    })

    fastify.patch<{ Params: { id: string }; Body: PatchBody }>(
      '/v1/connections/:id',
      async (request, reply) => {
        if (!(await assertScope(request, reply, 'connections:write'))) return
        const tenantId = tenantOf(request)
        const body = request.body ?? {}
        if (!('label' in body)) {
          return reply.status(400).send({
            error: {
              code: 'MISSING_LABEL',
              message: "Body must include 'label' (string or null to clear).",
            },
          })
        }
        const next = body.label
        if (next !== null && typeof next !== 'string') {
          return reply.status(400).send({
            error: { code: 'INVALID_LABEL', message: "'label' must be a string or null." },
          })
        }
        try {
          const updated = await credentials.updateMetadataForOwner(tenantId, request.params.id, {
            label: next,
          })
          if (!updated) return notFound(reply, request.params.id)
          return reply.send({ data: updated, meta: { fetchedAt: new Date().toISOString() } })
        } catch (err) {
          if (err instanceof DuplicateLabelError) {
            return reply.status(409).send({
              error: { code: 'DUPLICATE_LABEL', message: err.message },
            })
          }
          throw err
        }
      },
    )

    fastify.delete<{ Params: { id: string } }>('/v1/connections/:id', async (request, reply) => {
      if (!(await assertScope(request, reply, 'connections:write'))) return
      const tenantId = tenantOf(request)
      // Capture creds + row BEFORE delete so we can unregister the platform
      // webhook afterwards (best-effort cleanup of the upstream endpoint).
      const row = await credentials.getRow(request.params.id)
      const creds = await credentials.loadById(request.params.id)
      const ok = await credentials.deleteForOwner(tenantId, request.params.id)
      if (!ok) return notFound(reply, request.params.id)

      const regId = creds?.extra?.['webhookRegistrationId']
      if (opts.registry && row?.vertical && creds && typeof regId === 'string' && regId) {
        const adapter = opts.registry.get(row.vertical, row.platform)
        if (adapter?.unregisterWebhook) {
          try {
            await adapter.unregisterWebhook(creds, regId)
          } catch (err) {
            request.log.warn(
              { platform: row.platform, vertical: row.vertical, err },
              'webhook unregister failed',
            )
          }
        }
      }
      return reply.status(204).send()
    })
  }
}
