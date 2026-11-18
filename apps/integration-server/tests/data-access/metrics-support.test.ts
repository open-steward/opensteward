/**
 * Customer-support metrics, run through the engine against seeded tickets,
 * tags and teams. SQLite always, Postgres when TEST_DATABASE_URL is set.
 *
 * Pins: resolution-time percentiles and histogram by hand; the open / solved
 * split (an `unknown` status is open); aging against the injected now; the
 * weekday × hour heatmap buckets; CSAT average, percent, distribution and
 * response rate; unassigned and urgent shares; requester and agent
 * concentration (shares, HHI); unnest + lookup labels that never cross the
 * tenant or the resource scope.
 *
 * Every expectation is computed by hand from the seed data. "Now" is
 * Wednesday 2026-03-18 12:00 UTC.
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
import { RESOURCE_METRICS } from '../../src/data-access/metrics/catalog'
import { CUSTOMER_SUPPORT_METRICS } from '../../src/data-access/metrics/catalog/customer-support'
import { catalogProblems } from '../../src/data-access/metrics/validate'
import type { MetricKpi, MetricResult } from '../../src/data-access/metrics/types'

const SECRET = 'd'.repeat(40)
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
const MARCH = { from: '2026-03-01', to: '2026-03-18' }
const ALL = { tenants: '*' as const }
const A = { tenants: ['tenant-a'] }

type Row = { id: string } & Record<string, unknown>

/**
 * March tickets: t1 t2 t3 t4 t5 t6 t7 t8 t9 t11 t12 (t10 is from February).
 * Solved: t1 t2 t3 t4 t5 t12 (t12 has no resolvedAt). Open: t6–t11.
 */
const TICKETS_A: Row[] = [
  { id: 't1', status: 'resolved', priority: 'urgent', channel: 'email', assigneeId: 'u1', teamId: 'tm1', tagIds: ['tg1'], requesterId: 'r1', createdAt: '2026-03-02T09:00:00Z', resolvedAt: '2026-03-02T11:00:00Z', updatedAt: '2026-03-02T11:00:00Z', satisfactionRating: 5 },
  { id: 't2', status: 'closed', priority: 'high', channel: 'chat', assigneeId: 'u1', teamId: 'tm1', tagIds: ['tg1', 'tg2'], requesterId: 'r2', createdAt: '2026-03-03T10:00:00Z', resolvedAt: '2026-03-03T14:00:00Z', updatedAt: '2026-03-03T14:00:00Z', satisfactionRating: 4 },
  { id: 't3', status: 'resolved', priority: 'normal', channel: 'email', assigneeId: 'u2', teamId: 'tm2', tagIds: [], requesterId: 'r1', createdAt: '2026-03-04T08:00:00Z', resolvedAt: '2026-03-05T08:00:00Z', updatedAt: '2026-03-05T08:00:00Z', satisfactionRating: 2 },
  { id: 't4', status: 'resolved', channel: 'web', assigneeId: 'u2', teamId: 'tm2', tagIds: ['tg2'], requesterId: 'r3', createdAt: '2026-03-05T00:00:00Z', resolvedAt: '2026-03-08T00:00:00Z', updatedAt: '2026-03-08T00:00:00Z' },
  { id: 't5', status: 'closed', priority: 'low', channel: 'email', assigneeId: 'u1', teamId: 'tm1', tagIds: [], requesterId: 'r1', createdAt: '2026-03-06T12:00:00Z', resolvedAt: '2026-03-16T12:00:00Z', updatedAt: '2026-03-16T12:00:00Z', satisfactionRating: 1 },
  { id: 't6', status: 'open', priority: 'urgent', channel: 'email', assigneeId: 'u1', teamId: 'tm1', tagIds: [], requesterId: 'r4', createdAt: '2026-03-17T10:00:00Z', updatedAt: '2026-03-17T12:00:00Z' },
  { id: 't7', status: 'pending', priority: 'high', channel: 'chat', teamId: 'tm2', tagIds: [], requesterId: 'r5', createdAt: '2026-03-10T08:00:00Z', updatedAt: '2026-03-11T08:00:00Z' },
  { id: 't8', status: 'on_hold', priority: 'normal', channel: 'email', assigneeId: 'u2', tagIds: [], requesterId: 'r6', createdAt: '2026-03-01T09:00:00Z', updatedAt: '2026-03-02T09:00:00Z' },
  { id: 't9', status: 'open', channel: 'voice', tagIds: [], requesterId: 'r1', createdAt: '2026-03-12T15:00:00Z', updatedAt: '2026-03-12T15:00:00Z' },
  { id: 't10', status: 'in_progress', priority: 'low', channel: 'api', assigneeId: 'u1', teamId: 'tm1', tagIds: [], requesterId: 'r7', createdAt: '2026-02-10T09:00:00Z', updatedAt: '2026-03-16T09:00:00Z' },
  { id: 't11', status: 'unknown', priority: 'high', channel: 'social', tagIds: [], requesterId: 'r8', createdAt: '2026-03-14T09:00:00Z', updatedAt: '2026-03-14T09:00:00Z' },
  { id: 't12', status: 'closed', priority: 'normal', channel: 'email', assigneeId: 'u2', teamId: 'tm2', tagIds: [], requesterId: 'r9', createdAt: '2026-03-09T10:00:00Z' },
]

describe.each(BACKENDS)('customer-support metrics [$name]', (backend) => {
  let handle: DbHandle
  let creds: CredentialStore
  let resources: ResourceStore
  let engine: MetricsEngine
  const conn = { accessToken: 'x' } as never
  const put = (v: string, p: string, c: string, t: string, rows: Row[]) =>
    resources.upsertMany(v, p, c, t, rows)

  const kpi = (r: MetricResult, key: string) =>
    r.kpis?.find((k: MetricKpi) => k.key === key)?.value
  const points = (r: MetricResult, name?: string) =>
    Object.fromEntries(
      (name ? r.series.find((s) => s.name === name)! : r.series[0]!).points.map((p) => [p.x, p.y]),
    )
  const ys = (r: MetricResult) => r.series[0]!.points.map((p) => p.y)
  const run = (id: string, params: Record<string, unknown> = {}, scope: object = A) =>
    engine.run(id, scope as never, { ...MARCH, ...params })

  beforeEach(async () => {
    if (backend.name === 'postgres') {
      const h = await backend.open()
      await h.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
      await h.close()
    }
    handle = await backend.open()
    creds = await CredentialStore.create(handle, SECRET)
    resources = await ResourceStore.create(handle)
    const sync = await SyncStore.create(handle)
    const deskA = await creds.create('zendesk', null, conn, 'Desk A', 'customer-support', 'tenant-a')
    const deskB = await creds.create('freshdesk', null, conn, 'Desk B', 'customer-support', 'tenant-b')
    await put('customer-support', 'zendesk', deskA, 'tickets', TICKETS_A)
    await put('customer-support', 'zendesk', deskA, 'tags', [
      { id: 'tg1', name: 'billing' },
      { id: 'tg2', name: 'bug' },
    ])
    await put('customer-support', 'zendesk', deskA, 'teams', [
      { id: 'tm1', name: 'Billing' },
      { id: 'tm2', name: 'Tech' },
    ])
    // Tenant B: colliding ids with other names, and an urgent unassigned ticket.
    await put('customer-support', 'freshdesk', deskB, 'tags', [
      { id: 'tg1', name: 'LEAK-TAG' },
    ])
    await put('customer-support', 'freshdesk', deskB, 'teams', [
      { id: 'tm1', name: 'LEAK-TEAM' },
    ])
    await put('customer-support', 'freshdesk', deskB, 'tickets', [
      { id: 'tb1', status: 'open', priority: 'urgent', channel: 'email', tagIds: ['tg1'], teamId: 'tm1', requesterId: 'rb', createdAt: '2026-03-16T09:00:00Z', updatedAt: '2026-03-01T09:00:00Z' },
    ])
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

  it('reads no pii, keeps the v1 ids and every duration and ratio declares coverage', () => {
    expect(catalogProblems(RESOURCE_METRICS)).toEqual([])
    const ids = new Set(CUSTOMER_SUPPORT_METRICS.map((m) => m.id))
    for (const id of [
      'customer-support.tickets_by_status',
      'customer-support.tickets_created_per_day',
      'customer-support.volume_heatmap',
      'customer-support.tickets_by_tag',
    ]) {
      expect(ids.has(id), id).toBe(true)
    }
    for (const m of CUSTOMER_SUPPORT_METRICS) {
      expect(m.id.startsWith('customer-support.')).toBe(true)
      if (m.kind === 'ratio' || m.kind === 'duration') expect(m.coverage?.length, m.id).toBeGreaterThan(0)
    }
  })

  // ── Volume and mix ───────────────────────────────────────────────────────

  it('tickets by channel and priority (priority in its own order, unset apart)', async () => {
    const ch = await run('customer-support.tickets_by_channel')
    expect(ch.series[0]!.points).toEqual([
      { x: 'email', y: 6 },
      { x: 'chat', y: 2 },
      { x: 'social', y: 1 },
      { x: 'voice', y: 1 },
      { x: 'web', y: 1 },
    ])
    expect(ch.value).toBe(11)
    const pr = await run('customer-support.tickets_by_priority')
    expect(pr.series[0]!.points).toEqual([
      { x: 'urgent', y: 2 },
      { x: 'high', y: 3 },
      { x: 'normal', y: 3 },
      { x: 'low', y: 1 },
      { x: 'unknown', y: 0 },
      { x: '(none)', y: 2 },
    ])
    expect(pr.metric.charts).not.toContain('funnel')
  })

  it('channel × priority matrix and the weekday × hour heatmap buckets', async () => {
    const m = (await run('customer-support.volume_by_channel_priority')).matrix!
    expect(m.x).toEqual(['urgent', 'high', 'normal', 'low', 'unknown', '(none)'])
    expect(m.y).toEqual(['email', 'chat', 'social', 'voice', 'web'])
    const cell = (x: string, y: string) =>
      m.cells.find(([xi, yi]) => xi === m.x.indexOf(x) && yi === m.y.indexOf(y))![2]
    expect(cell('urgent', 'email')).toBe(2)
    expect(cell('normal', 'email')).toBe(3)
    expect(cell('low', 'email')).toBe(1)
    expect(cell('high', 'chat')).toBe(2)
    expect(cell('(none)', 'voice')).toBe(1)
    expect(cell('(none)', 'web')).toBe(1)
    expect(cell('high', 'email')).toBe(0)

    const heat = await run('customer-support.volume_heatmap')
    const h = heat.matrix!
    expect(h.x.length).toBe(24)
    expect(h.y).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(h.cells.length).toBe(24 * 7)
    expect(h.cells.reduce((n, c) => n + c[2], 0)).toBe(11)
    const at = (day: string, hour: number) =>
      h.cells.find(([xi, yi]) => xi === hour && yi === h.y.indexOf(day))![2]
    // t2 and t6 are Tuesdays at 10:00; t1 Monday 09:00; t12 Monday 10:00; t4 Thursday 00:00; t8 Sunday 09:00.
    expect(at('Tue', 10)).toBe(2)
    expect(at('Mon', 9)).toBe(1)
    expect(at('Mon', 10)).toBe(1)
    expect(at('Thu', 0)).toBe(1)
    expect(at('Sun', 9)).toBe(1)
    expect(at('Wed', 10)).toBe(0)
    expect(heat.note).toMatch(/UTC/)
  })

  it('tickets by team and tag: unnest, lookup labels, and nothing from another tenant or scope', async () => {
    const team = await run('customer-support.tickets_by_team')
    expect(team.series[0]!.points).toEqual([
      { x: 'Billing', y: 4 },
      { x: 'Tech', y: 4 },
      { x: '(none)', y: 3 },
    ])
    const tags = await run('customer-support.tickets_by_tag')
    // t1 [tg1], t2 [tg1 tg2], t4 [tg2]: each tag twice; tickets with no tags add nothing.
    expect(tags.series[0]!.points).toEqual([
      { x: 'billing', y: 2 },
      { x: 'bug', y: 2 },
    ])
    expect(JSON.stringify(tags)).not.toContain('LEAK')
    // Tags out of the resource scope: the ids stand in for the names.
    const restricted = await run('customer-support.tickets_by_tag', {}, {
      tenants: ['tenant-a'],
      verticals: { 'customer-support': ['tickets'] },
    })
    expect(restricted.series[0]!.points).toEqual([
      { x: 'tg1', y: 2 },
      { x: 'tg2', y: 2 },
    ])
  })

  // ── Backlog and flow ─────────────────────────────────────────────────────

  it('open tickets now: an unknown status is open', async () => {
    expect((await run('customer-support.open_tickets_now')).value).toBe(6)
    expect(points(await run('customer-support.open_tickets_by_status'))).toEqual({
      open: 2,
      in_progress: 1,
      pending: 1,
      on_hold: 1,
      unknown: 1,
    })
    expect((await run('customer-support.open_tickets_now', {}, ALL)).value).toBe(7)
    expect(points(await run('customer-support.open_tickets_by_team'))).toEqual({
      Billing: 2,
      Tech: 1,
      '(none)': 3,
    })
  })

  it('solved per day and the backlog change over the period', async () => {
    const solved = await run('customer-support.tickets_solved_per_day')
    expect(solved.value).toBe(5)
    const p = points(solved)
    expect(p['2026-03-02']).toBe(1)
    expect(p['2026-03-03']).toBe(1)
    expect(p['2026-03-04']).toBe(0)
    expect(p['2026-03-05']).toBe(1)
    expect(p['2026-03-08']).toBe(1)
    expect(p['2026-03-16']).toBe(1)
    // 11 created, 5 solved with a solved date: the backlog grew by 6.
    const change = await run('customer-support.backlog_change')
    expect(change.series[0]!.points).toEqual([
      { x: 'Created', y: 11 },
      { x: 'Solved', y: -5 },
      { x: 'Net', y: 6 },
    ])
    expect(change.value).toBe(6)
  })

  // ── Speed ────────────────────────────────────────────────────────────────

  it('resolution time: percentiles and histogram by hand', async () => {
    const r = await run('customer-support.resolution_time')
    // t1 2h, t2 4h, t3 24h, t4 72h, t5 240h (t12 has no solved date).
    expect(kpi(r, 'n')).toBe(5)
    expect(kpi(r, 'mean')).toBe(68.4)
    expect(kpi(r, 'p50')).toBe(24)
    // p90: h = 4 × 0.9 = 3.6 → 72 + 0.6 × (240 − 72) = 172.8
    expect(kpi(r, 'p90')).toBe(172.8)
    expect(r.value).toBe(24)
    expect(r.stats![0]).toEqual({ group: 'All', n: 5, min: 2, p25: 4, p50: 24, p75: 72, p90: 172.8, max: 240, mean: 68.4 })
    expect(r.series[0]!.points).toEqual([
      { x: '< 1 h', y: 0 },
      { x: '1–4 h', y: 1 },
      { x: '4–24 h', y: 1 },
      { x: '24–72 h', y: 1 },
      { x: '72–168 h', y: 1 },
      { x: '≥ 168 h', y: 1 },
    ])
    expect(r.coverage).toEqual({ eligible: 5, total: 5 })
    expect(r.note).toMatch(/approximate/)
  })

  it('resolution time per priority and channel', async () => {
    const pr = await run('customer-support.resolution_time_by_priority')
    const stat = (g: string) => pr.stats!.find((s) => s.group === g)!
    expect(stat('urgent')).toMatchObject({ n: 1, p50: 2 })
    expect(stat('high')).toMatchObject({ n: 1, p50: 4 })
    expect(stat('normal')).toMatchObject({ n: 1, p50: 24 })
    expect(stat('low')).toMatchObject({ n: 1, p50: 240 })
    expect(stat('(none)')).toMatchObject({ n: 1, p50: 72 })
    const ch = await run('customer-support.resolution_time_by_channel')
    // email: t1 2h, t3 24h, t5 240h → median 24.
    expect(ch.stats!.find((s) => s.group === 'email')).toMatchObject({ n: 3, min: 2, p50: 24, max: 240 })
    expect(ch.metric.charts).toContain('boxplot')
  })

  it('share of solved tickets that carry a solved date', async () => {
    const r = await run('customer-support.solved_timestamp_coverage')
    // Solved and created in March: t1–t5 and t12 = 6; five have resolvedAt.
    expect(r.value).toBe(83.33)
    expect(kpi(r, 'denominator')).toBe(6)
  })

  // ── Satisfaction ─────────────────────────────────────────────────────────

  it('CSAT: average, percent, distribution, response rate and by channel', async () => {
    // Ratings on tickets solved in March: 5, 4, 2, 1 (t4 and t12 have none).
    expect((await run('customer-support.csat_score')).value).toBe(3)
    const pct = await run('customer-support.csat_percent')
    expect(pct.value).toBe(50)
    expect(kpi(pct, 'denominator')).toBe(4)
    const dist = await run('customer-support.csat_distribution')
    expect(dist.series[0]!.points).toEqual([
      { x: '1', y: 1 },
      { x: '2', y: 1 },
      { x: '3', y: 0 },
      { x: '4', y: 1 },
      { x: '5', y: 1 },
    ])
    // Rated 4 of the 6 solved tickets created in March.
    expect((await run('customer-support.csat_response_rate')).value).toBe(66.67)
    // email 5, 2, 1 → 2.6667; chat 4.
    expect(points(await run('customer-support.csat_by_channel'))).toEqual({ chat: 4, email: 2.6667 })
    const trend = points(await run('customer-support.csat_trend'))
    expect(trend['2026-03-02']).toBe(5)
    expect(trend['2026-03-03']).toBe(4)
    expect(trend['2026-03-04']).toBeNull()
    expect(trend['2026-03-05']).toBe(2)
    expect(trend['2026-03-16']).toBe(1)
    expect((await run('customer-support.detractor_share')).value).toBe(50)
  })

  // ── Agents and workload ──────────────────────────────────────────────────

  it('tickets per agent, solved per agent and open load', async () => {
    expect(points(await run('customer-support.tickets_per_agent'))).toEqual({ u1: 4, u2: 4, '(none)': 3 })
    expect(points(await run('customer-support.solved_per_agent'))).toEqual({ u1: 3, u2: 2 })
    expect(points(await run('customer-support.open_tickets_by_agent'))).toEqual({ u1: 2, u2: 1, '(none)': 3 })
    const m = (await run('customer-support.agent_workload')).matrix!
    const cell = (x: string, y: string) =>
      m.cells.find(([xi, yi]) => xi === m.x.indexOf(x) && yi === m.y.indexOf(y))![2]
    // Open now: t6 urgent u1, t7 high none, t8 normal u2, t9 unset none, t10 low u1, t11 high none.
    expect(cell('urgent', 'u1')).toBe(1)
    expect(cell('low', 'u1')).toBe(1)
    expect(cell('normal', 'u2')).toBe(1)
    expect(cell('high', '(none)')).toBe(2)
    expect(cell('(none)', '(none)')).toBe(1)
    expect(cell('urgent', 'u2')).toBe(0)
  })

  // ── Risk ─────────────────────────────────────────────────────────────────

  it('open tickets by age, against the injected now', async () => {
    const r = await run('customer-support.aging_open_tickets')
    // Days since creation at 03-18: t6 1, t9 6 and t11 4, t7 8, t8 17, t10 36.
    expect(r.series[0]!.points).toEqual([
      { x: '0–1 days', y: 1 },
      { x: '2–3 days', y: 0 },
      { x: '4–7 days', y: 2 },
      { x: '8–14 days', y: 1 },
      { x: '15–30 days', y: 1 },
      { x: '31+ days', y: 1 },
    ])
    expect(r.value).toBe(6)
    expect((await run('customer-support.open_over_7_days')).value).toBe(3)
    // Days since last update: t6 1, t10 2, t9 6 t11 4 t7 7, t8 16.
    expect(ys(await run('customer-support.stale_open_tickets'))).toEqual([1, 1, 3, 0, 1, 0])
    expect(ys(await run('customer-support.stuck_pending_hold'))).toEqual([0, 1, 0, 1, 0])
  })

  it('unassigned, urgent and open urgent tickets', async () => {
    expect((await run('customer-support.unassigned_tickets')).value).toBe(3)
    expect(points(await run('customer-support.unassigned_by_priority'))).toEqual({
      urgent: 0,
      high: 2,
      normal: 0,
      low: 0,
      unknown: 0,
      '(none)': 1,
    })
    const share = await run('customer-support.unassigned_share')
    expect(share.value).toBe(50)
    expect(share.coverage).toEqual({ eligible: 3, total: 6 })
    // High or urgent: t1 t6 t2 t7 t11 = 5 of the 9 tickets with a priority.
    const urgent = await run('customer-support.urgent_share')
    expect(urgent.value).toBe(55.56)
    expect(urgent.coverage).toEqual({ eligible: 9, total: 11 })
    expect((await run('customer-support.open_urgent_tickets')).value).toBe(1)
  })

  it('concentration by requester and by agent', async () => {
    const req = await run('customer-support.customer_concentration')
    // r1 raised 4 of 11; eight requesters in all → HHI (16 + 7) / 121 = 1901; effective N 5.26.
    expect(kpi(req, 'top1_share')).toBe(36.36)
    expect(kpi(req, 'top5_share')).toBe(72.73)
    expect(kpi(req, 'top10_share')).toBe(100)
    expect(kpi(req, 'hhi')).toBe(1901)
    expect(kpi(req, 'effective_n')).toBe(5.26)
    expect(kpi(req, 'groups')).toBe(8)
    const agent = await run('customer-support.agent_concentration')
    // Solved in March with a solved date: u1 3, u2 2 → 60 / 40, HHI 5200.
    expect(kpi(agent, 'top1_share')).toBe(60)
    expect(kpi(agent, 'top3_share')).toBe(100)
    expect(kpi(agent, 'hhi')).toBe(5200)
    expect(kpi(agent, 'groups')).toBe(2)
    expect(agent.thresholds).toEqual({ warn: 40, crit: 60, direction: 'above' })
  })

  // ── Scope ────────────────────────────────────────────────────────────────

  it('never counts another tenant’s tickets', async () => {
    expect((await run('customer-support.unassigned_tickets')).value).toBe(3)
    expect((await run('customer-support.unassigned_tickets', {}, ALL)).value).toBe(4)
    expect((await run('customer-support.open_urgent_tickets', {}, ALL)).value).toBe(2)
    expect((await run('customer-support.tickets_by_channel', {}, ALL)).value).toBe(12)
  })
})
