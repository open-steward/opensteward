/**
 * CRM metrics, run through the engine against seeded deals, activities,
 * contacts and companies. SQLite always, Postgres when TEST_DATABASE_URL is set.
 *
 * Pins: MAJOR-unit money (a 40 000 USD pipeline is 4 000 000 minor units, not
 * 400); the won / lost / open split from the raw status label (case-insensitive
 * won / lost, every casing excluded from open, `deleted` counted nowhere);
 * per-currency ratios, averages and concentration; the sales cycle over won
 * deals only (a close date before the creation date is dropped); owner and
 * company concentration with company names from the same scope; overdue and
 * stale deals against the injected now; activity completion; data completeness;
 * scope (a restricted tenant never sees another tenant's deals) and masking.
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
import { CRM_METRICS, OPEN_DEAL, caseVariants } from '../../src/data-access/metrics/catalog/crm'
import { catalogProblems } from '../../src/data-access/metrics/validate'
import type { MetricKpi, MetricResult } from '../../src/data-access/metrics/types'

const SECRET = 'c'.repeat(40)
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
const usd = (amount: number) => ({ amount, currency: 'USD' })

// ── Deals (tenant A) ───────────────────────────────────────────────────────
// Open: d1 d2 d3 d10. Won: d4 d5 d6 d11 d12. Lost: d7 d8. Deleted: d9.
const DEALS_A: Row[] = [
  {
    id: 'd1',
    title: 'Deal 1',
    status: 'open',
    stage: 'Qualified',
    owner_id: 'o2',
    company_id: 'co1',
    value: usd(10000),
    created_at: '2026-01-10T00:00:00Z',
    updated_at: '2026-03-15T00:00:00Z',
    close_date: '2026-04-10T00:00:00Z',
  },
  {
    id: 'd2',
    title: 'Deal 2',
    status: 'Open',
    stage: 'Negotiation',
    owner_id: 'o1',
    company_id: 'co1',
    value: usd(30000),
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z',
    close_date: '2026-03-01T00:00:00Z',
  },
  {
    id: 'd3',
    title: 'Deal 3',
    stage: 'Qualified',
    owner_id: 'o2',
    company_id: 'co2',
    value: { amount: 5000, currency: 'EUR' },
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-10T00:00:00Z',
    close_date: '2026-06-20T00:00:00Z',
  },
  {
    id: 'd4',
    title: 'Deal 4',
    status: 'won',
    owner_id: 'o1',
    company_id: 'co1',
    value: usd(8000),
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-03-11T00:00:00Z',
    close_date: '2026-03-11T00:00:00Z',
  },
  {
    id: 'd5',
    title: 'Deal 5',
    status: 'Closed Won',
    owner_id: 'o2',
    company_id: 'co2',
    value: usd(12000),
    created_at: '2026-01-01T00:00:00Z',
    close_date: '2026-03-05T00:00:00Z',
  },
  {
    id: 'd6',
    title: 'Deal 6',
    status: 'closedwon',
    owner_id: 'o2',
    company_id: 'co3',
    value: { amount: 3000, currency: 'EUR' },
    created_at: '2026-03-01T00:00:00Z',
    close_date: '2026-03-16T00:00:00Z',
  },
  {
    id: 'd7',
    title: 'Deal 7',
    status: 'lost',
    owner_id: 'o1',
    company_id: 'co1',
    value: usd(4000),
    created_at: '2026-02-10T00:00:00Z',
    close_date: '2026-03-08T00:00:00Z',
  },
  {
    id: 'd8',
    title: 'Deal 8',
    status: 'Closed Lost',
    owner_id: 'o2',
    company_id: 'co2',
    value: usd(6000),
    created_at: '2026-02-15T00:00:00Z',
    close_date: '2026-02-20T00:00:00Z',
  },
  {
    // Deleted: counted by no metric that asks for open, won or lost.
    id: 'd9',
    title: 'Deal 9',
    status: 'deleted',
    owner_id: 'o1',
    value: usd(99999),
    created_at: '2026-03-01T00:00:00Z',
  },
  {
    // No status, owner, value, close date or update time.
    id: 'd10',
    title: 'Deal 10',
    status: 'open',
    stage: 'Qualified',
    created_at: '2026-03-12T00:00:00Z',
  },
  {
    // Won GBP deal with no company.
    id: 'd11',
    title: 'Deal 11',
    status: 'won',
    owner_id: 'o1',
    value: { amount: 7000, currency: 'GBP' },
    created_at: '2026-03-02T00:00:00Z',
    close_date: '2026-03-12T00:00:00Z',
  },
  {
    // Won, but "closed" before it was created: in win rate and value, not in the cycle.
    id: 'd12',
    title: 'Deal 12',
    status: 'won',
    owner_id: 'o3',
    company_id: 'co1',
    value: usd(1000),
    created_at: '2026-03-10T00:00:00Z',
    close_date: '2026-03-05T00:00:00Z',
  },
]

const ACTIVITIES_A: Row[] = [
  { id: 'a1', type: 'call', owner_id: 'o1', created_at: '2026-03-02T09:00:00Z', due_date: '2026-03-05T09:00:00Z', done: true },
  { id: 'a2', type: 'call', owner_id: 'o1', created_at: '2026-03-03T09:00:00Z', due_date: '2026-03-10T09:00:00Z', done: false },
  { id: 'a3', type: 'email', owner_id: 'o2', created_at: '2026-03-04T09:00:00Z', due_date: '2026-03-12T09:00:00Z', done: true },
  { id: 'a4', type: 'meeting', owner_id: 'o2', created_at: '2026-03-05T09:00:00Z', due_date: '2026-03-20T09:00:00Z', done: false },
  { id: 'a5', type: 'call', owner_id: 'o2', created_at: '2026-03-06T09:00:00Z', due_date: '2026-03-01T09:00:00Z' },
  { id: 'a6', type: 'task', owner_id: 'o1', created_at: '2026-02-10T09:00:00Z', due_date: '2026-03-01T09:00:00Z', done: false },
]

const CONTACTS_A: Row[] = [
  { id: 'c1', stage: 'lead', company_id: 'co1', owner_id: 'o1', created_at: '2026-03-01T00:00:00Z' },
  { id: 'c2', stage: 'customer', company_id: 'co2', created_at: '2026-03-02T00:00:00Z' },
  { id: 'c3', stage: 'lead', created_at: '2026-03-03T00:00:00Z' },
  { id: 'c4', created_at: '2026-03-04T00:00:00Z' },
]

describe.each(BACKENDS)('crm metrics [$name]', (backend) => {
  let handle: DbHandle
  let creds: CredentialStore
  let resources: ResourceStore
  let engine: MetricsEngine
  const conn = { accessToken: 'x' } as never
  const put = (v: string, p: string, c: string, t: string, rows: Row[]) =>
    resources.upsertMany(v, p, c, t, rows)

  const kpi = (r: MetricResult, key: string, currency?: string | null) =>
    r.kpis?.find(
      (k: MetricKpi) => k.key === key && (currency === undefined || k.currency === currency),
    )?.value
  const totals = (r: MetricResult) =>
    Object.fromEntries((r.totals ?? []).map((t) => [t.currency, t.amount]))
  const points = (r: MetricResult, name?: string) =>
    Object.fromEntries(
      (name ? r.series.find((s) => s.name === name)! : r.series[0]!).points.map((p) => [p.x, p.y]),
    )

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
    const crmA = await creds.create('hubspot', null, conn, 'CRM A', 'crm', 'tenant-a')
    const crmB = await creds.create('pipedrive', null, conn, 'CRM B', 'crm', 'tenant-b')
    await put('crm', 'hubspot', crmA, 'deals', DEALS_A)
    await put('crm', 'hubspot', crmA, 'activities', ACTIVITIES_A)
    await put('crm', 'hubspot', crmA, 'contacts', CONTACTS_A)
    await put('crm', 'hubspot', crmA, 'companies', [
      { id: 'co1', name: 'Acme' },
      { id: 'co2', name: 'Beta' },
      { id: 'co3', name: 'Gamma' },
    ])
    // Tenant B: a huge open deal, an activity, and a company whose id collides with A's.
    await put('crm', 'pipedrive', crmB, 'deals', [
      {
        id: 'db1',
        title: 'Leak',
        status: 'open',
        stage: 'Qualified',
        owner_id: 'ob',
        company_id: 'co1',
        value: usd(777000),
        created_at: '2026-03-02T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        close_date: '2026-03-10T00:00:00Z',
      },
    ])
    await put('crm', 'pipedrive', crmB, 'activities', [
      { id: 'ab1', type: 'call', owner_id: 'o1', created_at: '2026-03-02T09:00:00Z', due_date: '2026-03-03T09:00:00Z', done: false },
    ])
    await put('crm', 'pipedrive', crmB, 'companies', [{ id: 'co1', name: 'LEAK' }])
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

  // ── Catalog hygiene ──────────────────────────────────────────────────────

  it('reads no pii or secret field, keeps the v1 ids, and marks label-dependent metrics with a note', () => {
    expect(catalogProblems(RESOURCE_METRICS)).toEqual([])
    const ids = new Set(CRM_METRICS.map((m) => m.id))
    for (const id of ['crm.contacts_created_per_day', 'crm.deals_by_stage', 'crm.deals_created_per_day']) {
      expect(ids.has(id), id).toBe(true)
    }
    for (const m of CRM_METRICS) {
      expect(m.id.startsWith('crm.')).toBe(true)
      // Every money measure is major units; no CRM amount is divided by 100.
      const measures =
        'measure' in m
          ? [m.measure]
          : 'numerator' in m
            ? [m.numerator.measure, m.denominator.measure]
            : []
      for (const meas of measures) {
        if (meas.op === 'sum' || meas.op === 'avg') {
          if (meas.currencyField) expect(meas.amountUnit, m.id).toBe('major')
        }
      }
      // Anything that reads the status label says so.
      const usesStatus = JSON.stringify(m).includes('"field":"status"')
      if (usesStatus) expect(m.note, m.id).toMatch(/status label/)
    }
  })

  it('OPEN excludes every common casing of the won, lost and deleted labels', () => {
    const excluded = OPEN_DEAL.value as string[]
    for (const s of ['won', 'Won', 'WON', 'Closed Won', 'closedwon', 'ClosedWon', 'closedWon', 'closed_won', 'CLOSED_LOST', 'Lost', 'deleted', 'Deleted']) {
      expect(excluded, s).toContain(s)
    }
    expect(caseVariants(['closed won'])).toEqual(
      expect.arrayContaining(['closed won', 'CLOSED WON', 'Closed won', 'Closed Won', 'Closed_Won', 'ClosedWon', 'closedWon']),
    )
  })

  // ── Pipeline (P1) ────────────────────────────────────────────────────────

  it('pipeline value: open deals only, per currency, in major units', async () => {
    const r = await run('crm.pipeline_value_total')
    // USD d1 + d2 = 40 000; EUR d3 = 5 000. Won, lost, deleted and the value-less d10 are out.
    expect(r.totals).toEqual([
      { currency: 'EUR', amount: 5000, amountMinor: 500000 },
      { currency: 'USD', amount: 40000, amountMinor: 4000000 },
    ])
    expect(r.currencies).toEqual(['EUR', 'USD'])
    expect(r.metric.snapshot).toBe(true)
    expect(r.note).toMatch(/status label/)
    const eur = await run('crm.pipeline_value_total', { currency: 'EUR' })
    expect(eur.totals).toEqual([{ currency: 'EUR', amount: 5000, amountMinor: 500000 }])
  })

  it('a zero-decimal currency keeps its major units', async () => {
    const crmA = (await creds.list()).find((c) => c.label === 'CRM A')!.id
    await put('crm', 'hubspot', crmA, 'deals', [
      { id: 'djp', title: 'Tokyo', status: 'open', value: { amount: 1200000, currency: 'JPY' } },
    ])
    const r = await run('crm.pipeline_value_total', { currency: 'JPY' })
    expect(r.totals).toEqual([{ currency: 'JPY', amount: 1200000, amountMinor: 1200000 }])
  })

  it('counts open deals and splits them by stage label and stage id', async () => {
    expect((await run('crm.open_deals_total')).value).toBe(4)
    const byStage = await run('crm.open_deals_by_stage')
    expect(byStage.series[0]!.points).toEqual([
      { x: 'Qualified', y: 3 },
      { x: 'Negotiation', y: 1 },
    ])
    const value = await run('crm.pipeline_value_by_stage')
    expect(points(value, 'USD')).toEqual({ Negotiation: 30000, Qualified: 10000 })
    expect(points(value, 'EUR')).toEqual({ Qualified: 5000 })
    expect(value.series.every((s) => s.currency !== undefined)).toBe(true)
  })

  it('buckets the open pipeline by expected close date, overdue first', async () => {
    const r = await run('crm.forecast_by_close_window')
    // Today is 03-18: d2 closes 03-01 (overdue), d1 04-10 (23 days), d3 06-20 (94 days).
    expect(points(r, 'USD')).toMatchObject({ 'Today or past': 30000, '1–30 days': 10000 })
    expect(points(r, 'EUR')).toMatchObject({ '91–180 days': 5000 })
    expect(points(r, 'USD')['31–60 days']).toBe(0)
  })

  it('pipeline by owner, per currency', async () => {
    const r = await run('crm.pipeline_by_owner')
    expect(points(r, 'USD')).toEqual({ o1: 30000, o2: 10000 })
    expect(points(r, 'EUR')).toEqual({ o2: 5000 })
  })

  it('new deals per week over ISO weeks', async () => {
    const r = await run('crm.new_deals_per_week', { granularity: 'week' })
    // Created 03-01..03-18: d3, d6 and d9 on Sunday 03-01 (W09); d11 03-02 (W10); d12 03-10 and d10 03-12 (W11).
    expect(points(r)).toEqual({ '2026-W09': 3, '2026-W10': 1, '2026-W11': 2, '2026-W12': 0 })
    expect(r.value).toBe(6)
  })

  // ── Outcomes (P1) ────────────────────────────────────────────────────────

  it('win rate by count: won ÷ (won + lost) of deals closing in the period', async () => {
    const r = await run('crm.win_rate')
    // Closing 03-01..03-18: won d4 d5 d6 d11 d12 = 5, lost d7 = 1 (d8 closed 02-20).
    expect(r.value).toBe(83.33)
    expect(kpi(r, 'numerator')).toBe(5)
    expect(kpi(r, 'denominator')).toBe(6)
    expect(r.note).toMatch(/status label/)
    expect(r.coverage).toBeDefined()
  })

  it('win rate by value never mixes currencies', async () => {
    const r = await run('crm.win_rate_by_value')
    // USD won 8000 + 12000 + 1000 = 21000 of 25000 (lost d7 4000); EUR and GBP have no loss.
    expect(kpi(r, 'ratio', 'USD')).toBe(84)
    expect(kpi(r, 'numerator', 'USD')).toBe(21000)
    expect(kpi(r, 'denominator', 'USD')).toBe(25000)
    expect(kpi(r, 'ratio', 'EUR')).toBe(100)
    expect(kpi(r, 'ratio', 'GBP')).toBe(100)
    expect(r.value).toBeNull()
  })

  it('won and lost deals and won value per month', async () => {
    const won = await run('crm.deals_won_per_month', { granularity: 'month' })
    expect(points(won)).toEqual({ '2026-03': 5 })
    expect((await run('crm.deals_lost_per_month', { granularity: 'month' })).series[0]!.points).toEqual([
      { x: '2026-03', y: 1 },
    ])
    const value = await run('crm.won_value_per_month', { granularity: 'month' })
    expect(totals(value)).toEqual({ EUR: 3000, GBP: 7000, USD: 21000 })
    expect(points(value, 'USD')).toEqual({ '2026-03': 21000 })
  })

  it('average deal size of won deals, per currency', async () => {
    const r = await run('crm.avg_deal_size')
    expect(totals(r)).toEqual({ EUR: 3000, GBP: 7000, USD: 7000 })
    const prior = await run('crm.avg_deal_size', { compare: true })
    expect(prior.previous).toBeDefined()
  })

  it('sales cycle: days from creation to close of won deals, dropping a close before creation', async () => {
    const r = await run('crm.sales_cycle_length')
    // d4 38, d5 63, d6 15, d11 10; d12 closes before it was created and is excluded.
    expect(kpi(r, 'n')).toBe(4)
    expect(kpi(r, 'mean')).toBe(31.5)
    expect(kpi(r, 'p50')).toBe(26.5)
    expect(kpi(r, 'p90')).toBe(55.5)
    expect(r.value).toBe(26.5)
    expect(r.series[0]!.points.map((p) => p.y)).toEqual([0, 1, 1, 1, 1, 0, 0])
    const byOwner = await run('crm.sales_cycle_by_owner')
    const stat = (g: string) => byOwner.stats!.find((s) => s.group === g)!
    expect(stat('o1')).toMatchObject({ n: 2, min: 10, max: 38, p50: 24 })
    expect(stat('o2')).toMatchObject({ n: 2, min: 15, max: 63, p50: 39 })
  })

  it('leaderboard: won value and deals per owner id', async () => {
    const value = await run('crm.won_value_by_owner')
    expect(points(value, 'USD')).toEqual({ o2: 12000, o1: 8000, o3: 1000 })
    expect(points(value, 'GBP')).toEqual({ o1: 7000 })
    const count = await run('crm.won_deals_by_owner')
    expect(points(count)).toEqual({ o1: 2, o2: 2, o3: 1 })
  })

  // ── Activities ───────────────────────────────────────────────────────────

  it('activities per owner, by type and owner × type', async () => {
    const perOwner = await run('crm.activities_per_owner')
    expect(points(perOwner)).toEqual({ o2: 3, o1: 2 })
    expect(points(await run('crm.activities_by_type'))).toEqual({ call: 3, email: 1, meeting: 1 })
    const m = (await run('crm.activities_owner_by_type')).matrix!
    expect(m.x).toEqual(['call', 'email', 'meeting'])
    expect(m.y).toEqual(['o2', 'o1'])
    const cell = (x: string, y: string) =>
      m.cells.find(([xi, yi]) => xi === m.x.indexOf(x) && yi === m.y.indexOf(y))![2]
    expect(cell('call', 'o1')).toBe(2)
    expect(cell('call', 'o2')).toBe(1)
    expect(cell('email', 'o2')).toBe(1)
    expect(cell('meeting', 'o2')).toBe(1)
    expect(cell('email', 'o1')).toBe(0)
    expect(m.cells.length).toBe(6)
  })

  it('overdue activities: due before today and not done (no flag counts as not done)', async () => {
    expect((await run('crm.overdue_activities')).value).toBe(3)
    expect(points(await run('crm.overdue_activities_by_owner'))).toEqual({ o1: 2, o2: 1 })
  })

  it('activity completion rate among activities with a done flag', async () => {
    const r = await run('crm.activity_completion_rate')
    // Due in March before today with a flag: a1 done, a2 not, a3 done, a6 not = 2 of 4.
    expect(r.value).toBe(50)
    expect(kpi(r, 'denominator')).toBe(4)
  })

  // ── Contacts and data quality ────────────────────────────────────────────

  it('contacts by lifecycle stage and field completeness', async () => {
    expect(points(await run('crm.contacts_by_lifecycle_stage'))).toEqual({
      lead: 2,
      customer: 1,
      '(none)': 1,
    })
    expect((await run('crm.contact_completeness_company')).value).toBe(50)
    expect((await run('crm.contact_completeness_owner')).value).toBe(25)
    expect((await run('crm.deal_completeness_owner')).value).toBe(75)
    expect((await run('crm.deal_completeness_value')).value).toBe(75)
    expect((await run('crm.deal_completeness_close_date')).value).toBe(75)
    expect((await run('crm.deal_completeness_probability')).value).toBe(0)
  })

  // ── Risk ─────────────────────────────────────────────────────────────────

  it('stale, overdue and incomplete open deals against the injected now', async () => {
    // Older than 30 days: updated before 2026-02-16 → only d2 (01-05). d10 has no update time.
    expect((await run('crm.stale_deals')).value).toBe(1)
    expect(totals(await run('crm.stale_deals_value'))).toEqual({ USD: 30000 })
    const stale = await run('crm.deal_staleness')
    // d1 3 days, d3 8 days → 0–14; d2 72 days → 61–90.
    expect(points(stale, 'USD')).toMatchObject({ '0–14 days': 10000, '61–90 days': 30000, '15–30 days': 0 })
    expect(points(stale, 'EUR')).toMatchObject({ '0–14 days': 5000 })
    // Close date before today: d2 only.
    expect((await run('crm.overdue_close_dates')).value).toBe(1)
    expect(points(await run('crm.overdue_close_value'), 'USD')).toMatchObject({
      '8–30 days': 30000,
      '0–7 days': 0,
    })
    expect((await run('crm.deals_without_owner')).value).toBe(1)
    expect((await run('crm.deals_without_close_date')).value).toBe(1)
    expect((await run('crm.deals_without_value')).value).toBe(1)
  })

  it('concentration of the open pipeline by deal, with deal titles', async () => {
    const r = await run('crm.pipeline_concentration')
    // USD: 30 000 and 10 000 → 75 / 25; HHI 0.75² + 0.25² = 0.625 → 6250; effective N 1.6.
    expect(kpi(r, 'top1_share', 'USD')).toBe(75)
    expect(kpi(r, 'top3_share', 'USD')).toBe(100)
    expect(kpi(r, 'hhi', 'USD')).toBe(6250)
    expect(kpi(r, 'effective_n', 'USD')).toBe(1.6)
    expect(kpi(r, 'hhi', 'EUR')).toBe(10000)
    const usd = r.table!.rows.filter((x) => x['currency'] === 'USD')
    expect(usd.map((x) => [x['label'], x['share'], x['cumulative']])).toEqual([
      ['Deal 2', 75, 75],
      ['Deal 1', 25, 100],
    ])
    expect(r.thresholds).toEqual({ warn: 20, crit: 40, direction: 'above' })
  })

  it('concentration by owner and by company, names from the same scope', async () => {
    const owner = await run('crm.owner_concentration')
    expect(kpi(owner, 'top1_share', 'USD')).toBe(75)
    expect(kpi(owner, 'hhi', 'USD')).toBe(6250)
    const won = await run('crm.customer_concentration')
    // USD won: Beta 12000, Acme 8000 + 1000 = 9000 of 21000 → 57.14 / 42.86, HHI 5102.
    expect(kpi(won, 'top1_share', 'USD')).toBe(57.14)
    expect(kpi(won, 'hhi', 'USD')).toBe(5102)
    expect(kpi(won, 'effective_n', 'USD')).toBe(1.96)
    const rows = won.table!.rows.filter((x) => x['currency'] === 'USD')
    expect(rows.map((x) => [x['label'], x['value']])).toEqual([
      ['Beta', 12000],
      ['Acme', 9000],
    ])
    // The GBP won deal has no company: it is reported apart, never ranked.
    expect(kpi(won, 'unattributed', 'GBP')).toBe(7000)
    expect(kpi(won, 'groups', 'GBP')).toBe(0)
    const open = await run('crm.pipeline_company_concentration')
    expect(kpi(open, 'top1_share', 'USD')).toBe(100)
  })

  it('pipeline coverage proxy: open closing in 90 days ÷ won in the last 90 days', async () => {
    const r = await run('crm.pipeline_coverage')
    // USD 10000 (d1, 04-10) ÷ 21000 = 47.62%; d2 is already past its close date, d3 is 94 days out.
    expect(kpi(r, 'ratio', 'USD')).toBe(47.62)
    expect(kpi(r, 'ratio', 'EUR')).toBe(0)
    expect(r.thresholds).toEqual({ warn: 300, crit: 200, direction: 'below' })
    expect(r.note).toMatch(/proxy/i)
  })

  it('win-rate trend reads the same outcomes over time', async () => {
    const r = await run('crm.win_rate_trend', { granularity: 'week' })
    expect(r.value).toBe(83.33)
    // 03-05 (d5, d12) and 03-08 (d7 lost) and 03-11/03-12 and 03-16: week W10 (03-02..03-08): won 2, lost 1.
    expect(points(r)['2026-W10']).toBe(66.67)
    expect(points(r)['2026-W09']).toBeNull()
  })

  it('open deal age by stage, hand-computed from the injected now', async () => {
    const r = await run('crm.deal_age_by_stage')
    // Ages at 03-18 12:00: d1 67.5, d2 45.5, d3 17.5, d10 6.5 days.
    expect(kpi(r, 'n')).toBe(4)
    const q = r.stats!.find((s) => s.group === 'Qualified')!
    expect(q).toMatchObject({ n: 3, min: 6.5, p50: 17.5, max: 67.5 })
    expect(r.stats!.find((s) => s.group === 'Negotiation')).toMatchObject({ n: 1, p50: 45.5 })
  })

  // ── Scope and masking ────────────────────────────────────────────────────

  it('never counts another tenant’s deals, activities or company names', async () => {
    const a = await run('crm.pipeline_value_total', {}, A)
    expect(totals(a)).toEqual({ EUR: 5000, USD: 40000 })
    const all = await run('crm.pipeline_value_total', {}, ALL)
    expect(totals(all).USD).toBe(817000)
    expect((await run('crm.overdue_activities', {}, A)).value).toBe(3)
    expect((await run('crm.overdue_activities', {}, ALL)).value).toBe(4)
    // Company names come from tenant A's connection only: "LEAK" never labels a row.
    const won = await run('crm.customer_concentration', {}, A)
    expect(JSON.stringify(won)).not.toContain('LEAK')
    // With companies out of the scope the label falls back to the id.
    const noLookup = await run('crm.customer_concentration', {}, {
      tenants: ['tenant-a'],
      verticals: { crm: ['deals'] },
    })
    const ids = noLookup.table!.rows.filter((x) => x['currency'] === 'USD').map((x) => x['label'])
    expect(ids).toEqual(['co2', 'co1'])
  })

  it('withholds money under mask_financial but keeps plain counts', async () => {
    const masked = { tenants: ['tenant-a'], maskFinancial: true }
    const money = await run('crm.pipeline_value_total', {}, masked)
    expect(money.masked).toBe(true)
    expect(money.totals).toEqual([])
    const conc = await run('crm.pipeline_concentration', {}, masked)
    expect(conc.masked).toBe(true)
    expect(conc.table).toBeUndefined()
    const count = await run('crm.open_deals_total', {}, masked)
    expect(count).toMatchObject({ masked: false, value: 4 })
  })
})
