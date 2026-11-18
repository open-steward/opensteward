/**
 * Runtime-settings admin UI. Lists every admin-tunable knob grouped
 * by category; inline PATCH edits one value at a time; "Reset" rolls
 * back to the seeded default. Admin-role only — operators can read
 * downstream effects of settings but cannot change them.
 *
 * Backed by admin-api `/api/runtime-settings`, which in turn reads
 * the `runtime_settings` table on admin.db and writes an audit-log
 * line on every mutation.
 */
import type { FastifyInstance } from 'fastify'
import { requireRole } from '../auth/middleware'
import { flashError, flashSuccess } from '../flash'
import type { AdminApiClient } from '../proxy/admin-api-client'
import { summarizeSystem, type VersionInfo } from '../version-info'
import { describeLicense, licenseAlert } from '../license-view'
import { formatBackendError } from '../proxy/format-backend-error'

const CATEGORY_LABELS: Record<string, string> = {
  rate_limits: 'Rate limits',
  features: 'Features',
  connect_links: 'Connect Links',
  data_store: 'Data store',
  data_access: 'Data access',
  webhooks: 'Webhooks',
  auth: 'Authentication',
  audit: 'Audit',
  openapi: 'OpenAPI / docs',
  logos: 'Platform logos',
}

const CATEGORY_ORDER = [
  'rate_limits',
  'features',
  'connect_links',
  'data_store',
  'data_access',
  'webhooks',
  'auth',
  'audit',
  'openapi',
  'logos',
]

export function createSettingsRoutes(
  apiClient: AdminApiClient,
  collectVersionInfo: () => Promise<VersionInfo>,
) {
  return async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requireRole('admin'))

    fastify.get('/settings', async (request, reply) => {
      const token = request.sessionUser!.token
      const rows = await apiClient.listRuntimeSettings(token)
      const byCategory = groupByCategory(rows)
      return reply.view('settings/index.ejs', {
        user: request.sessionUser,
        byCategory,
        categoryLabels: CATEGORY_LABELS,
        categoryOrder: CATEGORY_ORDER.filter((c) => byCategory[c]?.length),
      })
    })

    fastify.post<{ Body: { key: string; value: string; valueType: string } }>(
      '/settings/update',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const { key, value: rawValue, valueType } = request.body
        if (!key) return reply.redirect('/settings')
        try {
          const coerced = coerceValue(rawValue, valueType)
          await apiClient.updateRuntimeSetting(token, key, coerced)
        } catch (err) {
          flashError(reply, err instanceof Error ? err.message : String(err))
          return reply.redirect('/settings')
        }
        flashSuccess(reply, `Saved ${key}.`)
        return reply.redirect('/settings')
      },
    )

    fastify.post<{ Params: { key: string } }>('/settings/:key/reset', async (request, reply) => {
      const token = request.sessionUser!.token
      try {
        await apiClient.resetRuntimeSetting(token, request.params.key)
      } catch (err) {
        flashError(reply, err instanceof Error ? err.message : String(err))
        return reply.redirect('/settings')
      }
      flashSuccess(reply, `Reset ${request.params.key} to its default.`)
      return reply.redirect('/settings')
    })

    // /settings/system — what an operator who installs published releases
    // needs: which release is running, whether every service is up, and
    // whether the last upgrade finished (every service on one release).
    // Per-service build detail stays in a collapsed Technical details block,
    // for bug reports. Schema migrations are not shown: they apply at boot and
    // fail closed (packages/shared/src/db/migrate.ts), so a service running a
    // release has applied its migrations — /api/schema-status below keeps the
    // rows for developers. The collector is best-effort, so a downstream blip
    // shows as "Not responding" rather than blanking the page. It also shows
    // the License card (integration-server's verdict via admin-api's
    // GET /api/license).
    fastify.get('/settings/system', async (request, reply) => {
      const token = request.sessionUser!.token
      // Best-effort, like the version fan-out: an unknown license renders as
      // unknown — never as "no license" — and costs the card, not the page. The
      // card shows admin-api's own words (its 503 names the admin secret when that is why).
      // The card and alert are built inside the same wrapper: a 200 whose record
      // lacks a field they read (version skew between the services) is unknown too.
      const unknown = (unavailable: string) => ({ card: null, alert: null, unavailable })
      const [versions, lic] = await Promise.all([
        collectVersionInfo(),
        apiClient.getLicense(token).then(
          (license) => {
            if (!license) {
              return unknown(
                'admin-api does not report the license (it is older than this console)',
              )
            }
            try {
              return {
                card: describeLicense(license),
                alert: licenseAlert(license),
                unavailable: null,
              }
            } catch {
              return unknown(
                'admin-api answered with a license status this console cannot read. Run the same OpenSteward release on admin-api and the admin console',
              )
            }
          },
          (err: unknown) => unknown(formatBackendError(err, 'admin-api did not answer')),
        ),
      ])
      return reply.view('settings/system.ejs', {
        user: request.sessionUser,
        versions,
        system: summarizeSystem(versions),
        license: lic.card,
        licenseAlert: lic.alert,
        licenseUnavailable: lic.unavailable,
      })
    })

    // /api/schema-status — JSON proxy to admin-api, useful for scripts
    // and the optional future doctor command. Reuses the same admin-role
    // gate the parent settings routes already enforce.
    fastify.get('/api/schema-status', async (request, reply) => {
      const token = request.sessionUser!.token
      try {
        const result = await apiClient.getSchemaStatus(token)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return reply.code(502).send({ error: msg })
      }
    })
  }
}

function groupByCategory(
  rows: Array<{ category: string; key: string }>,
): Record<string, typeof rows> {
  const out: Record<string, typeof rows> = {}
  for (const row of rows) {
    out[row.category] ??= []
    out[row.category].push(row)
  }
  return out
}

function coerceValue(raw: string, valueType: string): unknown {
  switch (valueType) {
    case 'number': {
      const n = Number(raw)
      if (!Number.isFinite(n)) throw new Error(`'${raw}' is not a valid number.`)
      return n
    }
    case 'boolean':
      return raw === 'true' || raw === 'on' || raw === '1'
    case 'string':
      return raw
    case 'json':
      try {
        return JSON.parse(raw)
      } catch {
        throw new Error('Value must be valid JSON.')
      }
    default:
      throw new Error(`Unknown valueType: ${valueType}`)
  }
}
