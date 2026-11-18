/**
 * `GET /health/data-store` — operational metrics for the cache + sync
 * subsystem. Public (no auth) so a Prometheus scraper can hit it from
 * the same network as the regular `/health` probe. The data exposed is
 * counts only — no resource bodies, tenant ids, or other sensitive
 * payloads — so it's safe to expose alongside `/health`.
 *
 * Mounted by `server.ts` only when `dataStore.mode != passthrough`.
 */
import type { FastifyPluginAsync } from 'fastify'
import { statSync } from 'node:fs'
import type { ResourceStore } from './resource-store'
import type { SyncStore } from './sync-store'

export interface CreateDataStoreMetricsRouterOptions {
  resourceStore: ResourceStore
  syncStore: SyncStore
  resourceDbPath: string
  /** Mode emitted in the response. */
  mode: 'database' | 'external'
}

export function createDataStoreMetricsRouter(
  opts: CreateDataStoreMetricsRouterOptions,
): FastifyPluginAsync {
  const { resourceStore, syncStore: _syncStore, resourceDbPath, mode } = opts

  return async (fastify) => {
    fastify.get('/health/data-store', async () => {
      // Both `resources` and `sync_jobs` live on the data-store handle.
      const k = resourceStore.getHandle().kysely

      const totalRow = await k
        .selectFrom('resources')
        .select((eb) => eb.fn.countAll().as('n'))
        .executeTakeFirstOrThrow()
      const perVerticalRows = (await k
        .selectFrom('resources')
        .select(['vertical'])
        .select((eb) => eb.fn.countAll().as('n'))
        .groupBy('vertical')
        .execute()) as Array<{ vertical: string; n: number }>
      const oldestRow = await k
        .selectFrom('resources')
        .select((eb) => eb.fn.min('updated_at').as('oldest'))
        .executeTakeFirstOrThrow()

      const jobCount = (status: string) =>
        k
          .selectFrom('sync_jobs')
          .select((eb) => eb.fn.countAll().as('n'))
          .where('status', '=', status)
          .executeTakeFirstOrThrow()
      const pendingRow = await jobCount('pending')
      const runningRow = await jobCount('running')
      const failedRow = await jobCount('failed')
      const perVerticalJobs = (await k
        .selectFrom('sync_jobs')
        .select(['vertical', 'status'])
        .select((eb) => eb.fn.countAll().as('n'))
        .where('status', 'in', ['pending', 'running', 'failed'])
        .groupBy(['vertical', 'status'])
        .execute()) as Array<{ vertical: string; status: string; n: number }>

      let dbSizeBytes: number | null = null
      try {
        dbSizeBytes = statSync(resourceDbPath).size
      } catch {
        /* DB not flushed to disk yet */
      }

      return {
        mode,
        path: resourceDbPath,
        rows: {
          total: Number(totalRow.n),
          per_vertical: Object.fromEntries(perVerticalRows.map((r) => [r.vertical, Number(r.n)])),
          oldest_age_ms: oldestRow.oldest ? Date.now() - Number(oldestRow.oldest) : null,
        },
        sync_jobs: {
          pending: Number(pendingRow.n),
          running: Number(runningRow.n),
          failed_recent: Number(failedRow.n),
          per_vertical: perVerticalJobs.reduce<Record<string, Record<string, number>>>((acc, r) => {
            const v = (acc[r.vertical] ??= {})
            v[r.status] = Number(r.n)
            return acc
          }, {}),
        },
        db_size_bytes: dbSizeBytes,
        db_size_mb:
          dbSizeBytes !== null ? Math.round((dbSizeBytes / (1024 * 1024)) * 10) / 10 : null,
        timestamp: new Date().toISOString(),
      }
    })
  }
}
