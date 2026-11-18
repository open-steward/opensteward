/**
 * Currency codes are normalised as they leave the engine.
 *
 * Stored records carry whatever the platform sent: `USD`, `usd`, ` Usd `, a
 * spelled-out name, or text an attacker chose. A code that trims and
 * upper-cases to three letters is that ISO code; anything else is the unknown
 * currency (`null`). Groups that normalise equal merge (`USD` + `usd` is one
 * currency, never two), and nothing raw reaches a series, total, KPI, table
 * row, `currencies`, `/currencies` or the `?currency=` match — the dashboard
 * puts these codes into HTML.
 *
 * Pins every path a currency takes: the grouped aggregate (value, count,
 * timeseries, breakdown, ratio, matrix), the per-currency histogram queries,
 * the duration and coverage filters that ran in SQL, and the distinct list.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMetricsEngine, type MetricsEngine } from '../../src/data-access/metrics/engine'
import type { MetricResult, ResourceMetricDefinition } from '../../src/data-access/metrics/types'
import { BACKENDS, NOW, SCOPE_A, openHarness, type Harness } from './metrics-harness'

const EVIL = '<img src=x onerror=alert(1)>'
const RANGE = { from: '2026-03-01', to: '2026-03-18' }

const base = {
  vertical: 'accounting',
  resourceType: 'invoices',
  section: 'overview' as const,
  dateField: 'postedAt',
}
const TOTAL = { op: 'sum', field: 'totalAmount', currencyField: 'currency' } as const

const DEFS: ResourceMetricDefinition[] = [
  {
    ...base,
    id: 'accounting.t_value',
    title: 'Total',
    description: 'Total.',
    kind: 'value',
    measure: TOTAL,
  },
  {
    ...base,
    id: 'accounting.t_count',
    title: 'Count',
    description: 'Count.',
    kind: 'value',
    measure: { op: 'count' },
    currencyField: 'currency',
    coverage: ['paidAt'],
  },
  {
    ...base,
    id: 'accounting.t_series',
    title: 'Series',
    description: 'Series.',
    kind: 'timeseries',
    measure: TOTAL,
  },
  {
    ...base,
    id: 'accounting.t_breakdown',
    title: 'By status',
    description: 'By status.',
    kind: 'breakdown',
    measure: TOTAL,
    group: { field: 'status' },
  },
  {
    ...base,
    id: 'accounting.t_hist',
    title: 'Bands',
    description: 'Bands.',
    kind: 'histogram',
    field: 'totalAmount',
    edges: [30, 60],
    currencyField: 'currency',
  },
  {
    ...base,
    id: 'accounting.t_duration',
    title: 'Days to pay',
    description: 'Days to pay.',
    kind: 'duration',
    from: 'postedAt',
    to: 'paidAt',
    unit: 'days',
    buckets: [1, 5],
    currencyField: 'currency',
  },
  {
    ...base,
    id: 'accounting.t_ratio',
    title: 'Paid share',
    description: 'Paid share.',
    kind: 'ratio',
    numerator: { measure: TOTAL, filters: [{ field: 'status', op: 'eq', value: 'PAID' }] },
    denominator: { measure: TOTAL },
  },
  {
    ...base,
    id: 'accounting.t_matrix',
    title: 'Matrix',
    description: 'Matrix.',
    kind: 'matrix',
    x: 'weekday',
    y: { field: 'status' },
    measure: TOTAL,
  },
]

// Seven invoices, three spellings of USD, one of EUR, three that are no code.
const INVOICES = [
  {
    id: 'i1',
    currency: 'USD',
    totalAmount: 10000,
    status: 'PAID',
    postedAt: '2026-03-02',
    paidAt: '2026-03-04',
  },
  { id: 'i2', currency: 'usd', totalAmount: 5000, status: 'OPEN', postedAt: '2026-03-03' },
  {
    id: 'i3',
    currency: ' Usd ',
    totalAmount: 2500,
    status: 'PAID',
    postedAt: '2026-03-03',
    paidAt: '2026-03-13',
  },
  { id: 'i4', currency: 'eur', totalAmount: 2000, status: 'OPEN', postedAt: '2026-03-04' },
  { id: 'i5', currency: EVIL, totalAmount: 700, status: 'OPEN', postedAt: '2026-03-05' },
  { id: 'i6', totalAmount: 300, status: 'OPEN', postedAt: '2026-03-05' },
  {
    id: 'i7',
    currency: 'US Dollar',
    totalAmount: 100,
    status: 'PAID',
    postedAt: '2026-03-05',
    paidAt: '2026-03-06',
  },
]

/** No raw spelling survives anywhere in a result. */
function expectNoRawCodes(r: MetricResult) {
  const json = JSON.stringify(r)
  for (const raw of ['<img', 'usd', ' Usd ', 'eur"', 'US Dollar'])
    expect(json, raw).not.toContain(raw)
}

for (const backend of BACKENDS) {
  describe(`currency normalisation (${backend.name})`, () => {
    let h: Harness
    let engine: MetricsEngine
    const run = (id: string, params: Record<string, string | undefined> = {}) =>
      engine.run(id, SCOPE_A, { ...RANGE, ...params })

    beforeEach(async () => {
      h = await openHarness(backend)
      engine = createMetricsEngine({
        credentialStore: h.creds,
        resourceStore: h.resources,
        now: () => NOW,
        resourceMetrics: DEFS,
      })
      const conn = await h.connect('xero', 'accounting', 'tenant-a')
      await h.put('accounting', 'xero', conn, 'invoices', INVOICES)
    })

    afterEach(async () => {
      await h.handle.close()
    })

    it('merges spellings of one code, and turns non-codes into the unknown currency', async () => {
      const r = await run('accounting.t_value')
      expect(r.currencies).toEqual(['EUR', 'USD'])
      expect(r.totals).toEqual([
        { currency: 'EUR', amount: 20, amountMinor: 2000 },
        { currency: 'USD', amount: 175, amountMinor: 17500 },
        { currency: null, amount: 11, amountMinor: 1100 },
      ])
      expect(r.series.map((s) => s.currency)).toEqual(['EUR', 'USD', null])
      expect(r.kpis?.map((k) => [k.currency, k.value])).toEqual([
        ['EUR', 1],
        ['USD', 3],
        [null, 3],
      ])
      expect(r.table?.rows.map((row) => row['currency'])).toEqual([
        'EUR',
        'USD',
        'Unknown currency',
      ])
      expectNoRawCodes(r)
    })

    it('matches ?currency= against the normalised code', async () => {
      const r = await run('accounting.t_value', { currency: 'USD' })
      expect(r.currencies).toEqual(['EUR', 'USD'])
      expect(r.totals).toEqual([{ currency: 'USD', amount: 175, amountMinor: 17500 }])
      expect((await run('accounting.t_count', { currency: 'USD' })).value).toBe(3)
      expect((await run('accounting.t_count')).value).toBe(7)
      expect((await run('accounting.t_count', { currency: 'EUR' })).value).toBe(1)
    })

    it('keeps a timeseries, a breakdown and a ratio per normalised code', async () => {
      const s = await run('accounting.t_series')
      expect(s.series.map((x) => x.currency)).toEqual(['EUR', 'USD', null])
      const usd = s.series.find((x) => x.currency === 'USD')!
      expect(Object.fromEntries(usd.points.filter((p) => p.y).map((p) => [p.x, p.y]))).toEqual({
        '2026-03-02': 100,
        '2026-03-03': 75,
      })
      expectNoRawCodes(s)

      const b = await run('accounting.t_breakdown', { currency: 'USD' })
      expect(b.series).toHaveLength(1)
      expect(Object.fromEntries(b.series[0]!.points.map((p) => [p.x, p.y]))).toEqual({
        PAID: 125,
        OPEN: 50,
      })

      const ratio = await run('accounting.t_ratio', { currency: 'USD' })
      expect(ratio.value).toBeCloseTo(71.43, 2)
      expectNoRawCodes(await run('accounting.t_ratio'))
    })

    it('bands a histogram once per normalised code', async () => {
      const r = await run('accounting.t_hist')
      expect(r.currencies).toEqual(['EUR', 'USD'])
      expect(r.series.map((x) => x.currency)).toEqual(['EUR', 'USD', null])
      const usd = r.series.find((x) => x.currency === 'USD')!
      expect(usd.points.map((p) => p.y)).toEqual([1, 1, 1])
      expectNoRawCodes(r)
      const only = await run('accounting.t_hist', { currency: 'USD' })
      expect(only.series.map((x) => x.currency)).toEqual(['USD'])
      expect(only.value).toBe(3)
    })

    it('filters a duration and its coverage by the normalised code', async () => {
      const all = await run('accounting.t_duration')
      expect(all.currencies).toEqual(['USD'])
      expect(all.kpis?.find((k) => k.key === 'n')?.value).toBe(3)
      const usd = await run('accounting.t_duration', { currency: 'USD' })
      expect(usd.kpis?.find((k) => k.key === 'n')?.value).toBe(2)
      expect(usd.value).toBe(6)
      const coverage = await run('accounting.t_count', { currency: 'USD' })
      expect(coverage.coverage).toEqual({ eligible: 2, total: 3 })
    })

    it('draws a money matrix when the spellings are one currency', async () => {
      const r = await run('accounting.t_matrix', { currency: 'USD' })
      expect(r.matrix).toBeDefined()
      expect(r.totals).toEqual([{ currency: 'USD', amount: 175, amountMinor: 17500 }])
      expectNoRawCodes(r)
    })

    it('lists only normalised codes in /currencies', async () => {
      expect(await engine.currencies(SCOPE_A)).toEqual(['EUR', 'USD'])
    })
  })
}
