/**
 * System metrics: sync history, credential state and stored-record counts,
 * always narrowed to the connections the caller may see. SQLite always,
 * Postgres when TEST_DATABASE_URL is set.
 *
 * Pins: success rate per day and overall; failures and durations per platform
 * (percentiles by hand); the reviewed error classes (and that raw error text,
 * secrets included, never leaves the server); connection status from the last
 * refresh; tokens expiring soon; stale connections; records per resource; and
 * scope filtering, both for the unrestricted read (one pass over the sync
 * table) and the restricted one (per connection): a tenant-scoped caller sees
 * nothing of another tenant's jobs, connections, tokens or records.
 *
 * "Now" is Wednesday 2026-03-18 12:00 UTC.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  CredentialStore,
  ResourceStore,
  SyncStore,
  openDb,
  type DbHandle,
} from '@opensteward/shared'
import { createMetricsEngine, type MetricsEngine } from '../../src/data-access/metrics/engine'
import { SYSTEM_METRICS } from '../../src/data-access/metrics/catalog'
import {
  SYNC_ERROR_CLASSES,
  classifySyncError,
} from '../../src/data-access/metrics/catalog/system'
import type { MetricKpi, MetricResult } from '../../src/data-access/metrics/types'

const SECRET = 'e'.repeat(40)
const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env['TEST_DATABASE_URL']) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env['TEST_DATABASE_URL'] }),
  })
}

const NOW = new Date('2026-03-18T12:00:00Z')
const HOUR = 3_600_000
const RANGE = { from: '2026-03-01', to: '2026-03-03' }
const ALL = { tenants: '*' as const }
const A = { tenants: ['tenant-a'] }
const B = { tenants: ['tenant-b'] }
const SECRET_TEXT = 'sk_live_TOPSECRET'

const at = (iso: string) => Date.parse(iso)

describe('sync error classes', () => {
  it('sorts each message into one reviewed class, first match winning', () => {
    const cases: Array<[string, string]> = [
      ['Not provided by hubspot: no endpoint', 'Not provided by platform'],
      ['Upstream platform returned 429: slow down', 'Rate limit (429)'],
      ['AxiosError: Request failed with status code 429', 'Rate limit (429)'],
      ['Upstream platform returned 401: nope', 'Auth (401/403)'],
      ['Upstream platform returned 403.', 'Auth (401/403)'],
      ['Token refresh failed: Error: invalid_grant', 'Auth (401/403)'],
      ['Upstream platform returned 503.', 'Upstream 5xx'],
      ['Upstream platform returned 500: Internal Server Error', 'Upstream 5xx'],
      ['Circuit breaker is open — platform temporarily unavailable', 'Upstream 5xx'],
      ['connect ETIMEDOUT 1.2.3.4:443', 'Timeout'],
      ['timeout of 30000ms exceeded', 'Timeout'],
      // First match wins: a gateway timeout is a timeout, a 429 that says "Unauthorized" a rate limit.
      ['Upstream platform returned 504: Gateway Timeout', 'Timeout'],
      ['Upstream platform returned 429: Unauthorized rate limit', 'Rate limit (429)'],
      // A number in a message is not a status.
      ['Synced 503 records then stopped', 'Other'],
      ['One or more resource types failed to sync', 'Other'],
      ['Something odd happened', 'Other'],
    ]
    for (const [msg, cls] of cases) expect(classifySyncError(msg), msg).toBe(cls)
    // The class list is closed and reviewed: exactly these five, then Other.
    expect(SYNC_ERROR_CLASSES.map((c) => c.label)).toEqual([
      'Not provided by platform',
      'Timeout',
      'Rate limit (429)',
      'Auth (401/403)',
      'Upstream 5xx',
    ])
  })

  it('adds the eight system metrics on top of the three v1 ids', () => {
    const ids = SYSTEM_METRICS.map((m) => m.id)
    for (const id of [
      'system.records_per_vertical',
      'system.sync_outcomes_per_day',
      'system.data_freshness',
      'system.records_per_resource',
      'system.sync_success_rate',
      'system.sync_failures_by_platform',
      'system.sync_duration',
      'system.connections_by_status',
      'system.token_expiring_soon',
      'system.stale_connections',
      'system.sync_error_types',
    ]) {
      expect(ids, id).toContain(id)
    }
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe.each(BACKENDS)('system metrics [$name]', (backend) => {
  let handle: DbHandle
  let creds: CredentialStore
  let resources: ResourceStore
  let sync: SyncStore
  let engine: MetricsEngine
  let a1: string // shopify, tenant-a
  let a2: string // hubspot, tenant-a
  let a3: string
  let a4: string
  let b1: string

  const kpi = (r: MetricResult, key: string) =>
    r.kpis?.find((k: MetricKpi) => k.key === key)?.value
  const pts = (r: MetricResult, name?: string) =>
    Object.fromEntries(
      (name ? r.series.find((s) => s.name === name)! : r.series[0]!).points.map((p) => [p.x, p.y]),
    )
  const run = (id: string, scope: object = A, params: Record<string, unknown> = {}) =>
    engine.run(id, scope as never, { ...RANGE, ...params })

  async function job(
    id: string,
    connectionId: string,
    vertical: string,
    platform: string,
    tenant: string,
    status: string,
    createdAt: string,
    extra: {
      startedAfterS?: number
      durationS?: number
      error?: string
      progress?: Record<string, { synced: number; status: string; error?: string }>
    } = {},
  ) {
    const created = at(createdAt)
    const started = extra.startedAfterS !== undefined ? created + extra.startedAfterS * 1000 : null
    await handle.kysely
      .insertInto('sync_jobs')
      .values({
        id,
        vertical,
        connection_id: connectionId,
        platform,
        tenant_id: tenant,
        status,
        progress: extra.progress ? JSON.stringify(extra.progress) : null,
        error: extra.error ?? null,
        created_at: created,
        started_at: started,
        completed_at:
          started !== null && extra.durationS !== undefined
            ? started + extra.durationS * 1000
            : null,
      })
      .execute()
  }

  beforeEach(async () => {
    if (backend.name === 'postgres') {
      const h = await backend.open()
      await h.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
      await h.close()
    }
    handle = await backend.open()
    creds = await CredentialStore.create(handle, SECRET)
    resources = await ResourceStore.create(handle)
    sync = await SyncStore.create(handle)
    const cred = (expiresAt?: number) =>
      ({ accessToken: 'x', ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}) }) as never
    const nowMs = NOW.getTime()
    a1 = await creds.create('shopify', null, cred(nowMs + HOUR), 'A shop', 'ecommerce', 'tenant-a')
    a2 = await creds.create('hubspot', null, cred(nowMs + 48 * HOUR), 'A crm', 'crm', 'tenant-a')
    a3 = await creds.create('xero', null, cred(nowMs + 72 * HOUR), 'A books', 'accounting', 'tenant-a')
    a4 = await creds.create('stripe', null, cred(nowMs - 24 * HOUR), 'A pay', 'payments', 'tenant-a')
    await creds.create('zendesk', null, cred(), 'A desk', 'customer-support', 'tenant-a')
    await creds.create('asana', null, cred(nowMs + 30 * 24 * HOUR), 'A projects', 'projects', 'tenant-a')
    b1 = await creds.create('shopify', null, cred(nowMs - 2 * HOUR), 'B shop', 'ecommerce', 'tenant-b')
    await creds.updateRefreshStatus(a1, 'ok')
    await creds.updateRefreshStatus(a2, 'expired', undefined, 'invalid_grant')
    await creds.updateRefreshStatus(a3, 'failed')
    await creds.updateRefreshStatus(b1, 'platform_error')

    // Records: A shop 3 orders; A crm 2 deals + 1 contact; B shop 5 orders.
    await resources.upsertMany('ecommerce', 'shopify', a1, 'orders', [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }])
    await resources.upsertMany('crm', 'hubspot', a2, 'deals', [{ id: 'd1' }, { id: 'd2' }])
    await resources.upsertMany('crm', 'hubspot', a2, 'contacts', [{ id: 'c1' }])
    await resources.upsertMany('ecommerce', 'shopify', b1, 'orders', [
      { id: 'b1' }, { id: 'b2' }, { id: 'b3' }, { id: 'b4' }, { id: 'b5' },
    ])
    // Last full collection: A shop 2 h ago, A crm 100 h ago; B shop 1 h ago. Others never.
    await resources.markCollectionComplete('ecommerce', 'shopify', a1, 'orders')
    await resources.markCollectionComplete('crm', 'hubspot', a2, 'deals')
    await resources.markCollectionComplete('ecommerce', 'shopify', b1, 'orders')
    const setCollected = async (conn: string, type: string, ms: number) => {
      await handle.kysely
        .updateTable('collection_sync')
        .set({ synced_at: ms })
        .where('tenant_id', '=', conn)
        .where('resource_type', '=', type)
        .execute()
    }
    await setCollected(a1, 'orders', nowMs - 2 * HOUR)
    await setCollected(a2, 'deals', nowMs - 100 * HOUR)
    await setCollected(b1, 'orders', nowMs - HOUR)

    // ── Sync jobs ──
    await job('j1', a1, 'ecommerce', 'shopify', 'tenant-a', 'completed', '2026-03-01T10:00:00Z', { startedAfterS: 0, durationS: 10 })
    await job('j2', a1, 'ecommerce', 'shopify', 'tenant-a', 'completed', '2026-03-02T10:00:00Z', { startedAfterS: 0, durationS: 30 })
    await job('j3', a1, 'ecommerce', 'shopify', 'tenant-a', 'failed', '2026-03-02T11:00:00Z', {
      startedAfterS: 0,
      durationS: 60,
      error: 'One or more resource types failed to sync',
      progress: {
        orders: { synced: 0, status: 'failed', error: 'Upstream platform returned 429: slow down' },
        products: { synced: 4, status: 'completed' },
      },
    })
    await job('j4', a1, 'ecommerce', 'shopify', 'tenant-a', 'failed', '2026-03-03T09:00:00Z', {
      startedAfterS: 0,
      durationS: 120,
      error: 'One or more resource types failed to sync',
      progress: { orders: { synced: 0, status: 'failed', error: 'Upstream platform returned 503.' } },
    })
    await job('j5', a2, 'crm', 'hubspot', 'tenant-a', 'completed', '2026-03-02T12:00:00Z', {
      startedAfterS: 0,
      durationS: 300,
      progress: {
        contacts: { synced: 9, status: 'completed' },
        deals: { synced: 0, status: 'skipped', error: 'Not provided by hubspot: no endpoint' },
      },
    })
    await job('j6', a2, 'crm', 'hubspot', 'tenant-a', 'failed', '2026-03-03T12:00:00Z', {
      error: 'Token refresh failed: Error: invalid_grant',
    })
    await job('j7', a2, 'crm', 'hubspot', 'tenant-a', 'failed', '2026-03-03T13:00:00Z', {
      error: 'connect ETIMEDOUT 1.2.3.4:443',
    })
    await job('j8', a2, 'crm', 'hubspot', 'tenant-a', 'pending', '2026-03-03T14:00:00Z')
    await job('j9', a1, 'ecommerce', 'shopify', 'tenant-a', 'failed', '2026-03-03T15:00:00Z', {
      error: 'Something odd happened',
    })
    await job('j10', a2, 'crm', 'hubspot', 'tenant-a', 'failed', '2026-03-03T16:00:00Z', {
      error: `Upstream platform returned 401: Bearer ${SECRET_TEXT}`,
    })
    // Outside the range: never counted.
    await job('j11', a1, 'ecommerce', 'shopify', 'tenant-a', 'failed', '2026-03-04T00:00:00Z', {
      error: 'Something odd happened',
    })
    await job('j12', a1, 'ecommerce', 'shopify', 'tenant-a', 'failed', '2026-02-28T23:59:00Z', {
      error: 'Something odd happened',
    })
    // Tenant B.
    await job('jb1', b1, 'ecommerce', 'shopify', 'tenant-b', 'failed', '2026-03-02T09:00:00Z', {
      error: 'Upstream platform returned 500',
    })
    await job('jb2', b1, 'ecommerce', 'shopify', 'tenant-b', 'completed', '2026-03-01T09:00:00Z', {
      startedAfterS: 0,
      durationS: 3600,
    })
    engine = createMetricsEngine({
      credentialStore: creds,
      resourceStore: resources,
      syncStore: sync,
      now: () => NOW,
    })
  })

  afterEach(async () => {
    await handle.close()
  })

  // ── Sync history ─────────────────────────────────────────────────────────

  it('sync success rate: per day and overall, completed ÷ (completed + failed)', async () => {
    const r = await run('system.sync_success_rate')
    // 03-01: j1 ok → 100. 03-02: j2 ok, j5 ok, j3 failed → 66.67. 03-03: five failures → 0 (j8 pending is not counted).
    expect(pts(r)).toEqual({ '2026-03-01': 100, '2026-03-02': 66.67, '2026-03-03': 0 })
    expect(r.value).toBe(33.33)
    expect(kpi(r, 'numerator')).toBe(3)
    expect(kpi(r, 'denominator')).toBe(9)
    expect(r.granularity).toBe('day')
    expect(r.thresholds).toEqual({ warn: 95, crit: 85, direction: 'below' })
    expect(r.metric).toMatchObject({ unit: 'percent', snapshot: false, granular: true, kind: 'ratio' })
    expect(r.metric.charts[0]).toBe('gauge')
  })

  it('a day with no finished job has no rate, not zero', async () => {
    const r = await run('system.sync_success_rate', A, { from: '2026-03-01', to: '2026-03-06' })
    // j11 failed on 03-04: a rate of 0. Nothing ran on 03-05 or 03-06: no rate.
    expect(pts(r)['2026-03-04']).toBe(0)
    expect(pts(r)['2026-03-05']).toBeNull()
    expect(pts(r)['2026-03-06']).toBeNull()
  })

  it('failures per platform, with jobs and failure rate', async () => {
    const r = await run('system.sync_failures_by_platform')
    // shopify: j3 j4 j9 failed of j1–j4 + j9 = 5; hubspot: j6 j7 j10 failed of j5 j6 j7 j8 j10 = 5.
    expect(r.value).toBe(6)
    expect(r.table!.rows).toEqual([
      { platform: 'hubspot', failed: 3, total: 5, failureRate: 60 },
      { platform: 'shopify', failed: 3, total: 5, failureRate: 60 },
    ])
    expect(pts(r)).toEqual({ hubspot: 3, shopify: 3 })
  })

  it('sync duration: percentiles by hand, overall and per platform', async () => {
    const r = await run('system.sync_duration')
    // Completed with times: j1 10 s, j2 30 s, j5 300 s.
    expect(kpi(r, 'n')).toBe(3)
    expect(kpi(r, 'mean')).toBe(113.33)
    expect(kpi(r, 'p50')).toBe(30)
    // p90: h = 2 × 0.9 = 1.8 → 30 + 0.8 × 270 = 246
    expect(kpi(r, 'p90')).toBe(246)
    expect(r.value).toBe(30)
    expect(r.stats![0]).toEqual({ group: 'All', n: 3, min: 10, p25: 20, p50: 30, p75: 165, p90: 246, max: 300, mean: 113.33 })
    expect(r.stats!.map((s) => s.group)).toEqual(['All', 'shopify', 'hubspot'])
    expect(r.stats![1]).toMatchObject({ n: 2, p50: 20 })
    expect(r.series[0]!.points.map((p) => p.y)).toEqual([0, 1, 1, 0, 1, 0])
    expect(r.metric.charts).toContain('boxplot')
  })

  it('sync error types: reviewed classes only, never the raw text', async () => {
    const r = await run('system.sync_error_types')
    // j3 429 · j4 503 · j5 skipped "not provided" · j6 invalid_grant + j10 401 · j7 timeout · j9 other.
    expect(r.series[0]!.points).toEqual([
      { x: 'Not provided by platform', y: 1 },
      { x: 'Timeout', y: 1 },
      { x: 'Rate limit (429)', y: 1 },
      { x: 'Auth (401/403)', y: 2 },
      { x: 'Upstream 5xx', y: 1 },
      { x: 'Other', y: 1 },
    ])
    expect(r.value).toBe(7)
    expect(r.table!.rows.find((x) => x['class'] === 'Auth (401/403)')).toEqual({
      class: 'Auth (401/403)',
      errors: 2,
      share: 28.57,
    })
    const text = JSON.stringify(r)
    expect(text).not.toContain(SECRET_TEXT)
    expect(text).not.toContain('slow down')
    expect(text).not.toContain('ETIMEDOUT')
    expect(text).not.toContain('no endpoint')
  })

  // ── Credential state ─────────────────────────────────────────────────────

  it('connections by status, from the last refresh attempt', async () => {
    const r = await run('system.connections_by_status')
    // ok: a1, a5 (no expiry, never refreshed), a6 (30 days left) · expired: a2 · failing: a3 · past expiry: a4.
    expect(pts(r)).toEqual({
      OK: 3,
      'Re-authorisation needed': 1,
      'Refresh failing': 1,
      'Token expired': 1,
    })
    expect(r.value).toBe(6)
    expect(r.table!.rows.find((x) => x['status'] === 'OK')!['share']).toBe(50)
    // Tenant B's platform_error connection is theirs alone.
    const b = await run('system.connections_by_status', B)
    expect(pts(b)).toEqual({ 'Platform credentials rejected': 1 })
  })

  it('tokens expiring within 7 days that the last refresh did not renew', async () => {
    const r = await run('system.token_expiring_soon')
    // a4 expired a day ago, a2 in 48 h, a3 in 72 h. a1 expires in an hour but its refresh was ok;
    // a5 has no expiry; a6 has 30 days.
    expect(r.value).toBe(3)
    expect(r.table!.rows.map((x) => [x['connectionId'], x['hoursUntilExpiry'], x['lastRefresh']])).toEqual([
      [a4, -24, null],
      [a2, 48, 'expired'],
      [a3, 72, 'failed'],
    ])
    expect(JSON.stringify(r)).not.toContain('invalid_grant')
  })

  it('stale connections: time since the last full collection, never-collected apart', async () => {
    const r = await run('system.stale_connections')
    expect(pts(r)).toEqual({
      'Under a day': 1,
      '1–3 days': 0,
      '3–7 days': 1,
      'Over 7 days': 0,
      'Never collected': 4,
    })
    // Stale = older than 3 days or never: a2 (100 h) and the four with no collection.
    expect(r.value).toBe(5)
    const rows = r.table!.rows
    expect(rows.length).toBe(5)
    expect(rows[4]).toMatchObject({ connectionId: a2, hoursSinceCollection: 100 })
    expect(rows.slice(0, 4).every((x) => x['hoursSinceCollection'] === null)).toBe(true)
    expect(rows.map((x) => x['connectionId'])).not.toContain(a1)
  })

  it('records per resource', async () => {
    const r = await run('system.records_per_resource')
    expect(pts(r)).toEqual({ 'ecommerce/orders': 3, 'crm/deals': 2, 'crm/contacts': 1 })
    expect(r.value).toBe(6)
    const restricted = await run('system.records_per_resource', {
      tenants: ['tenant-a'],
      verticals: { crm: ['deals'] },
    })
    expect(pts(restricted)).toEqual({ 'crm/deals': 2 })
  })

  // ── Scope ────────────────────────────────────────────────────────────────

  it('a tenant-scoped caller sees nothing of another tenant’s jobs, on every sync metric', async () => {
    const a = await run('system.sync_success_rate', A)
    const b = await run('system.sync_success_rate', B)
    // B has one completed (03-01) and one failed (03-02) job.
    expect(kpi(b, 'numerator')).toBe(1)
    expect(kpi(b, 'denominator')).toBe(2)
    expect(kpi(a, 'denominator')).toBe(9)
    const all = await run('system.sync_success_rate', ALL)
    expect(kpi(all, 'numerator')).toBe(4)
    expect(kpi(all, 'denominator')).toBe(11)
    // Failures: B's 500 is never in A's platform table, and A's are not in B's.
    expect((await run('system.sync_failures_by_platform', A)).value).toBe(6)
    const failB = await run('system.sync_failures_by_platform', B)
    expect(failB.table!.rows).toEqual([{ platform: 'shopify', failed: 1, total: 2, failureRate: 50 }])
    // B's 500 is the only error B has; its long completed job is B's alone.
    expect(pts(await run('system.sync_error_types', B))['Upstream 5xx']).toBe(1)
    expect((await run('system.sync_error_types', B)).value).toBe(1)
    const durB = await run('system.sync_duration', B)
    expect(kpi(durB, 'n')).toBe(1)
    expect(kpi(durB, 'p50')).toBe(3600)
    expect(kpi(await run('system.sync_duration', A), 'p90')).toBe(246)
  })

  it('a tenant-scoped caller sees only their own connections, tokens and records', async () => {
    const b = await run('system.token_expiring_soon', B)
    expect(b.table!.rows.map((x) => x['connectionId'])).toEqual([b1])
    expect((await run('system.token_expiring_soon', A)).table!.rows.map((x) => x['connectionId'])).not.toContain(b1)
    const stale = await run('system.stale_connections', B)
    expect(pts(stale)['Under a day']).toBe(1)
    expect(stale.value).toBe(0)
    expect(pts(await run('system.records_per_resource', B))).toEqual({ 'ecommerce/orders': 5 })
    // A tenant with a vertical grant only reaches that vertical's connections.
    const narrowed = await run('system.connections_by_status', {
      tenants: ['tenant-a'],
      tenantVerticals: { 'tenant-a': ['crm'] },
    })
    expect(pts(narrowed)).toEqual({ 'Re-authorisation needed': 1 })
    // A restricted scope with a tenantVerticals grant reads jobs per connection: only crm jobs.
    const jobs = await run('system.sync_failures_by_platform', {
      tenants: ['tenant-a'],
      tenantVerticals: { 'tenant-a': ['crm'] },
    })
    expect(jobs.table!.rows).toEqual([{ platform: 'hubspot', failed: 3, total: 5, failureRate: 60 }])
  })

  it('a caller with no connections in scope sees empty results, not an error', async () => {
    const none = { tenants: ['tenant-zzz'] }
    expect((await run('system.sync_success_rate', none)).value).toBeNull()
    expect((await run('system.connections_by_status', none)).value).toBe(0)
    expect((await run('system.sync_error_types', none)).value).toBe(0)
    expect((await run('system.token_expiring_soon', none)).value).toBe(0)
  })

  it('lists the new metrics in the catalog with their units and charts', async () => {
    const info = engine.catalog(A).filter((m) => m.id.startsWith('system.'))
    expect(info.length).toBe(11)
    const byId = Object.fromEntries(info.map((m) => [m.id, m]))
    expect(byId['system.sync_success_rate']).toMatchObject({ unit: 'percent', snapshot: false })
    expect(byId['system.sync_duration']).toMatchObject({ kind: 'duration', snapshot: false })
    expect(byId['system.token_expiring_soon']!.charts).toEqual(['table'])
    // The v1 three keep their shape.
    expect(byId['system.data_freshness']).toMatchObject({ kind: 'table', snapshot: true, unit: 'count' })
    expect(byId['system.sync_outcomes_per_day']).toMatchObject({ kind: 'timeseries', granular: true })
  })
})
