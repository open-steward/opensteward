/**
 * Liveness probe. Returns 200 with a small JSON body so the docker
 * healthcheck and any reverse proxy can confirm the process is up.
 */
import type { FastifyPluginAsync } from 'fastify'
import type { UnifiedAdapterRegistry } from '../adapter/unified-registry'
import type { DataStoreMode } from '../data-store/cached-router-helpers'

export interface UnifiedHealthRouterOptions {
  registry?: UnifiedAdapterRegistry
  /** Lazy resolver for data-store status. Returns `null` in passthrough
   *  mode (no cache running). Called on every /health request — keep it
   *  cheap (no DB queries). */
  dataStoreStatus?: () => {
    mode: DataStoreMode
    path?: string
    syncWorkers: number
  } | null
}

function adaptersByVertical(registry?: UnifiedAdapterRegistry): Record<string, number> {
  const out: Record<string, number> = {}
  for (const vertical of registry?.verticals() ?? []) {
    out[vertical] = registry!.listByVertical(vertical).length
  }
  return out
}

export function createUnifiedHealthRouter(
  opts: UnifiedHealthRouterOptions = {},
): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/health', async () => ({
      status: 'ok',
      verticals: opts.registry?.verticals() ?? [],
      adapters: opts.registry?.count() ?? 0,
      // Per-vertical breakdown, for consumers that show a count next to each
      // vertical (the admin dashboard) — the deployment-wide total alone
      // cannot be attributed to a vertical.
      adaptersByVertical: adaptersByVertical(opts.registry),
      dataStore: opts.dataStoreStatus?.() ?? null,
      timestamp: new Date().toISOString(),
    }))
  }
}
