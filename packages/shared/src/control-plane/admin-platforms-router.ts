/**
 * Unified admin-platforms router — list + enable + disable + config every
 * platform across every vertical. ("Platform" is the user-facing term; the
 * TS class names — BaseAdapter, AdapterRegistry — use "adapter" internally.)
 *
 * Settings are keyed by `(vertical, slug)`, so colliding slugs across
 * verticals (e.g. `bexio` in both accounting and crm) get distinct rows.
 *
 * Access control follows the same ADMIN_SECRET convention as the shared
 * admin-guard helper — see that module for the env-var rules.
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { AdapterSettingsStore } from '../adapter/settings-store'
import type { UnifiedAdapterRegistry } from '../adapter/unified-registry'
import { adminGuard } from './admin-guard'
import { unsupportedRefusal, type UnsupportedPlatform } from '../reference/platform-status'

export interface UnifiedAdminPlatformsRouterOptions {
  registry: UnifiedAdapterRegistry
  settingsStore: AdapterSettingsStore
  /** Optional resolver for per-platform recommended scopes from metadata.
   *  Surfaces in the redacted-config response so the admin UI can render a
   *  scope picker without operators having to type strings by hand. */
  getRecommendedScopes?: (vertical: string, slug: string) => string[] | null
  /** Optional resolver for whether the adapter honors per-link scope
   *  overrides (`getAuthUrl(state, overrideScopes)`). When false, the
   *  Connect Link admin form disables the scope-group dropdown so admins
   *  don't pick a scope that the adapter will silently ignore. Defaults
   *  to true (scope override honored) when undefined. */
  getSupportsScopeOverride?: (vertical: string, slug: string) => boolean
  /** Optional resolver for per-platform read-only scopes from metadata.
   *  Surfaces in the redacted-config response so the admin UI can pre-select
   *  read-only scopes and badge them in the scope picker. Null when the
   *  platform has no catalogued read-only scopes. */
  getReadScopes?: (vertical: string, slug: string) => string[] | null
  /**
   * Optional resolver for the "unsupported" platform status (listed but not
   * connectable — see `UnsupportedPlatform` in the reference module). When
   * set for `(vertical, slug)`: `POST .../enable` refuses with a 400 before
   * calling `registry.enable`, and `GET /admin/platforms` rows carry
   * `unsupported`. `disable` and the config routes are unaffected.
   */
  getUnsupported?: (
    vertical: string,
    slug: string,
  ) => (UnsupportedPlatform & { name?: string }) | undefined
}

interface PlatformRow {
  vertical: string
  slug: string
  enabled: boolean
  hasConfig: boolean
  unsupported?: UnsupportedPlatform
}

export function createUnifiedAdminPlatformsRouter(
  opts: UnifiedAdminPlatformsRouterOptions,
): FastifyPluginAsync {
  return async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', async (request, reply) => {
      if (!adminGuard(request, reply)) {
        // adminGuard already sent the 403 response.
        return reply
      }
    })

    fastify.get<{ Querystring: { vertical?: string } }>('/admin/platforms', async (request) => {
      const { vertical } = request.query
      const knownByVertical = opts.registry.knownSlugsByVertical()
      const rows: PlatformRow[] = []
      const verticals = vertical ? [vertical] : Object.keys(knownByVertical)
      for (const v of verticals) {
        const slugs = knownByVertical[v] ?? []
        for (const slug of slugs) {
          const settings = await opts.settingsStore.get(v, slug)
          const info = opts.getUnsupported?.(v, slug)
          rows.push({
            vertical: v,
            slug,
            enabled: settings?.enabled ?? false,
            hasConfig: !!(settings?.config && Object.keys(settings.config).length > 0),
            ...(info
              ? {
                  unsupported: {
                    reason: info.reason,
                    ...(info.issueUrl ? { issueUrl: info.issueUrl } : {}),
                  },
                }
              : {}),
          })
        }
      }
      return { data: rows }
    })

    fastify.post<{
      Params: { vertical: string; slug: string }
      Body: { config?: Record<string, unknown> }
    }>('/admin/platforms/:vertical/:slug/enable', async (request, reply) => {
      const { vertical, slug } = request.params
      if (!isKnown(opts.registry, vertical, slug)) {
        return reply.status(404).send({ error: `Unknown platform: ${vertical}/${slug}` })
      }
      const unsupported = opts.getUnsupported?.(vertical, slug)
      if (unsupported) {
        return reply.status(400).send(unsupportedRefusal(unsupported.name ?? slug, unsupported))
      }
      // registry.enable() persists to settingsStore AND instantiates the
      // platform so the live registry picks it up without a restart.
      await opts.registry.enable(vertical, slug, request.body?.config)
      return { ok: true }
    })

    fastify.post<{ Params: { vertical: string; slug: string } }>(
      '/admin/platforms/:vertical/:slug/disable',
      async (request, reply) => {
        const { vertical, slug } = request.params
        if (!isKnown(opts.registry, vertical, slug)) {
          return reply.status(404).send({ error: `Unknown platform: ${vertical}/${slug}` })
        }
        await opts.registry.disable(vertical, slug)
        return { ok: true }
      },
    )

    // Redacted config read — `clientSecret` is intentionally never returned
    // so the admin UI can prefill non-secret fields without ever re-handling
    // the secret. The shape is whitelisted (clientId, redirectUri, scopes)
    // rather than blacklisted so any future config keys default to hidden.
    fastify.get<{ Params: { vertical: string; slug: string } }>(
      '/admin/platforms/:vertical/:slug/config',
      async (request, reply) => {
        const { vertical, slug } = request.params
        if (!isKnown(opts.registry, vertical, slug)) {
          return reply.status(404).send({ error: `Unknown platform: ${vertical}/${slug}` })
        }
        const settings = await opts.settingsStore.get(vertical, slug)
        const cfg = settings?.config ?? {}
        const recommendedScopes = opts.getRecommendedScopes?.(vertical, slug) ?? null
        const supportsScopeOverride = opts.getSupportsScopeOverride?.(vertical, slug) ?? true
        const readScopes = opts.getReadScopes?.(vertical, slug) ?? null
        const data = {
          clientId: typeof cfg.clientId === 'string' ? cfg.clientId : null,
          redirectUri: typeof cfg.redirectUri === 'string' ? cfg.redirectUri : null,
          scopes: Array.isArray(cfg.scopes) ? cfg.scopes : null,
          // Some platforms run separate production and sandbox OAuth
          // environments (ShipBob), where the wrong one fails with an
          // unexplained provider error page. The operator has to be able to
          // see which is set, not only write it.
          sandbox: cfg.sandbox === true,
          supportsSandbox:
            (opts.registry.get(vertical, slug) as { capabilities?: { supportsSandbox?: boolean } })
              ?.capabilities?.supportsSandbox === true,
          hasSecret: typeof cfg.clientSecret === 'string' && cfg.clientSecret.length > 0,
          recommendedScopes,
          readScopes,
          supportsScopeOverride,
        }
        return { data }
      },
    )

    fastify.put<{
      Params: { vertical: string; slug: string }
      Body: { config: Record<string, unknown> }
    }>('/admin/platforms/:vertical/:slug/config', async (request, reply) => {
      const { vertical, slug } = request.params
      if (!isKnown(opts.registry, vertical, slug)) {
        return reply.status(404).send({ error: `Unknown platform: ${vertical}/${slug}` })
      }
      if (!request.body?.config || typeof request.body.config !== 'object') {
        return reply.status(400).send({ error: 'Body must include a config object' })
      }
      await opts.registry.setConfig(vertical, slug, request.body.config)
      return { ok: true }
    })
  }
}

function isKnown(registry: UnifiedAdapterRegistry, vertical: string, slug: string): boolean {
  const slugs = registry.knownSlugsByVertical()[vertical]
  return Array.isArray(slugs) && slugs.includes(slug)
}
