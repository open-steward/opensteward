/**
 * Shared setup for the per-vertical metric tests: SQLite always, Postgres
 * too when TEST_DATABASE_URL is set (the schema is dropped before each test),
 * an engine pinned at NOW, and small helpers to read results by hand.
 */
import {
  CredentialStore,
  ResourceStore,
  SyncStore,
  openDb,
  type DbHandle,
} from '@opensteward/shared'
import { createMetricsEngine, type MetricsEngine } from '../../src/data-access/metrics/engine'
import type { DataScope } from '../../src/data-access/scope'
import type {
  MetricKpi,
  MetricResult,
  MetricSeries,
} from '../../src/data-access/metrics/types'

export const SECRET = 'c'.repeat(40)

export const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env['TEST_DATABASE_URL']) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env['TEST_DATABASE_URL'] }),
  })
}

/** "Now" for every test: Wednesday 2026-03-18, 12:00 UTC. */
export const NOW = new Date('2026-03-18T12:00:00Z')
export const SCOPE_A: DataScope = { tenants: ['tenant-a'] }
export const SCOPE_B: DataScope = { tenants: ['tenant-b'] }

export type Row = { id: string } & Record<string, unknown>

export interface Harness {
  handle: DbHandle
  creds: CredentialStore
  resources: ResourceStore
  engine: MetricsEngine
  /** A connection of `vertical` owned by `tenant`. */
  connect(platform: string, vertical: string, tenant: string, label?: string): Promise<string>
  /** Store records of one resource type for a connection. */
  put(vertical: string, platform: string, connectionId: string, resourceType: string, rows: Row[]): Promise<unknown>
  /** Run a metric as tenant A over `from`–`to` (or the given params). */
  run(
    id: string,
    params?: { from?: string; to?: string; currency?: string; granularity?: string; compare?: boolean },
    scope?: DataScope,
  ): Promise<MetricResult>
}

export async function openHarness(backend: {
  open: () => Promise<DbHandle>
}): Promise<Harness> {
  const handle = await backend.open()
  if (handle.dialect === 'postgres') {
    await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
  }
  const creds = await CredentialStore.create(handle, SECRET)
  const resources = await ResourceStore.create(handle)
  const sync = await SyncStore.create(handle)
  const engine = createMetricsEngine({
    credentialStore: creds,
    resourceStore: resources,
    syncStore: sync,
    now: () => NOW,
  })
  const conn = { accessToken: 'x' } as never
  return {
    handle,
    creds,
    resources,
    engine,
    connect: (platform, vertical, tenant, label = `${platform} ${tenant}`) =>
      creds.create(platform, null, conn, label, vertical, tenant),
    put: (vertical, platform, connectionId, resourceType, rows) =>
      resources.upsertMany(vertical, platform, connectionId, resourceType, rows),
    run: (id, params = {}, scope = SCOPE_A) => engine.run(id, scope, params),
  }
}

export const kpi = (r: MetricResult, key: string, currency?: string | null): number | null | undefined =>
  r.kpis?.find((k: MetricKpi) => k.key === key && (currency === undefined || k.currency === currency))
    ?.value

export const series = (r: MetricResult, name?: string): MetricSeries =>
  name === undefined ? r.series[0]! : r.series.find((s) => s.name === name)!

/** `{ x: y }` of a series' points. */
export const points = (r: MetricResult, name?: string): Record<string, number | null> =>
  Object.fromEntries(series(r, name).points.map((p) => [p.x, p.y]))

/** Non-zero points only, for sparse day series. */
export const nonZero = (r: MetricResult, name?: string): Record<string, number | null> =>
  Object.fromEntries(Object.entries(points(r, name)).filter(([, y]) => y !== 0))

/** Table rows keyed by label. */
export const rowsByLabel = (r: MetricResult): Record<string, Record<string, string | number | null>> =>
  Object.fromEntries((r.table?.rows ?? []).map((row) => [String(row['label']), row]))
