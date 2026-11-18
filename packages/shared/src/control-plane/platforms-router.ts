/**
 * Unified platforms router — returns a flat list of every platform across
 * every vertical, with a `vertical` tag on each row.
 *
 * Each row carries an `enabled` boolean reflecting the deployment-specific
 * adapter-enable state (resolved from the same AdapterSettingsStore that
 * backs `/admin/platforms`). Developer keys can use this to know which
 * platforms are actually wired up on this deployment without needing
 * admin secret.
 *
 * The unified service wires this up by concatenating each vertical's
 * PLATFORMS metadata array and passing the result in.
 *
 * Auth is the CALLER's concern: pass a `preHandler` to gate the routes (the
 * integration-server supplies dev-key-or-admin-secret). Without one the
 * routes are open — useful in unit tests, never in production.
 */
import type { FastifyInstance, FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'

import type { AdapterSettingsStore } from '../adapter/settings-store'
import type { UnsupportedPlatform } from '../reference/platform-status'

export interface PlatformEntry {
  slug: string
  vertical: string
  name: string
  description?: string
  website?: string
  category?: string
  primary_color?: string
  auth_type?: string
  hq_country?: string
  docs_url?: string
  pricing_url?: string
  founded_year?: number
  /** Curated catalog of OAuth scopes surfaced as checkbox options. */
  recommendedScopes?: readonly string[]
  /** Unambiguously read-only OAuth scopes for this platform. Drives the
   *  'read_only' scope policy on Connect Links. Absent when the platform has
   *  no read-only scopes (link then falls back to platform default). */
  readScopes?: readonly string[]
  /** False when the adapter ignores per-link scope overrides (scopes fixed at
   *  the OAuth-app level). */
  supportsScopeOverride?: boolean
  /** When set, this platform is listed but cannot be connected or enabled —
   *  see `UnsupportedPlatform`. Surfaced verbatim on `GET /v1/platforms` and
   *  `GET /v1/platforms/:vertical/:slug` so API callers can see the reason
   *  and tracking issue without a 400 round-trip. */
  unsupported?: UnsupportedPlatform
  [key: string]: unknown
}

export interface UnifiedPlatformsRouterOptions {
  platforms: PlatformEntry[]
  /**
   * Optional adapter-settings store. When supplied, each row's `enabled`
   * boolean reflects the live per-deployment enable state. Without it,
   * `enabled` defaults to `false` for every platform — useful in unit
   * tests where no settings store is wired.
   */
  settingsStore?: AdapterSettingsStore
  /**
   * Optional auth gate applied to both routes. The runtime spec declares
   * these operations as authenticated; the integration-server passes a
   * Bearer-dev-key-or-X-Admin-Secret handler here.
   */
  preHandler?: preHandlerAsyncHookHandler
}

async function annotate(
  rows: PlatformEntry[],
  settingsStore: AdapterSettingsStore | undefined,
): Promise<Array<PlatformEntry & { enabled: boolean }>> {
  return Promise.all(
    rows.map(async (p) => ({
      ...p,
      enabled: (await settingsStore?.get(p.vertical, p.slug))?.enabled ?? false,
    })),
  )
}

export function createUnifiedPlatformsRouter(
  opts: UnifiedPlatformsRouterOptions,
): FastifyPluginAsync {
  return async (fastify: FastifyInstance) => {
    const routeOpts = opts.preHandler ? { preHandler: opts.preHandler } : {}
    fastify.get<{ Querystring: { vertical?: string; search?: string; enabled?: string } }>(
      '/v1/platforms',
      routeOpts,
      async (request) => {
        let out = opts.platforms
        const { vertical, search, enabled } = request.query
        if (vertical) out = out.filter((p) => p.vertical === vertical)
        if (search) {
          const q = search.toLowerCase()
          out = out.filter(
            (p) => p.slug.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
          )
        }
        let annotated = await annotate(out, opts.settingsStore)
        if (enabled === 'true') annotated = annotated.filter((p) => p.enabled)
        else if (enabled === 'false') annotated = annotated.filter((p) => !p.enabled)
        return { data: annotated }
      },
    )

    fastify.get<{ Params: { vertical: string; slug: string } }>(
      '/v1/platforms/:vertical/:slug',
      routeOpts,
      async (request, reply) => {
        const match = opts.platforms.find(
          (p) => p.vertical === request.params.vertical && p.slug === request.params.slug,
        )
        if (!match) return reply.status(404).send({ error: 'Platform not found' })
        const [annotated] = await annotate([match], opts.settingsStore)
        return { data: annotated }
      },
    )
  }
}
