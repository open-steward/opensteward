/**
 * Logistics metrics against hand-computed values. SQLite always, Postgres when
 * TEST_DATABASE_URL is set.
 *
 * "Now" is Wednesday 2026-03-18 12:00 UTC; the range is 2026-03-01 to 2026-03-15
 * unless a test says otherwise. Shipments (tenant-a):
 *
 *  id  status            carrier  created      est.    delivered        cost
 *  s1  DELIVERED         ups      03-01 10:00  03-05   03-04 12:00      USD 10.00
 *  s2  DELIVERED         ups      03-02 10:00  03-05   03-05 18:00      USD 12.00
 *  s3  DELIVERED         ups      03-03 00:00  03-06   03-08 00:00      USD  8.00
 *  s4  DELIVERED         fdx      03-01 00:00  03-03   03-02 00:00      USD 30.00
 *  s5  DELIVERED         fdx      03-04 12:00  -       03-10 12:00      EUR 25.00
 *  s6  DELIVERED         -        03-05        -       -                -
 *  s7  IN_TRANSIT        ups      03-06        updatedAt 03-06          USD  9.00
 *  s8  OUT_FOR_DELIVERY  fdx      03-10        updatedAt 03-17
 *  s9  EXCEPTION         ups      03-08        updatedAt 03-01
 *  s10 LABEL_CREATED     fdx      03-12        updatedAt 02-10          USD  7.00
 *  s11 RETURNED          ups      03-09
 *  s12 CANCELLED         fdx      03-11
 *  s13 UNKNOWN           -        03-13
 *  s14 DELIVERED         ups      02-15  (est 02-18, delivered 02-20)   outside the range
 *  s15 PENDING           ups      03-14
 *  s16 IN_TRANSIT        fdx      03-16        updatedAt 03-11 (7 days: not yet stuck)
 *  s17 IN_TRANSIT        ups      03-16        updatedAt 03-10 (8 days: stuck)
 *
 * 14 shipments are created in the range. Tenant-b holds one shipment and a
 * carrier with the same id as tenant-a's UPS: its name must never label a
 * tenant-a row.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RESOURCE_METRICS } from '../../src/data-access/metrics/catalog'
import {
  BACKENDS,
  SCOPE_A,
  SCOPE_B,
  kpi,
  nonZero,
  series,
  openHarness,
  points,
  rowsByLabel,
  type Harness,
  type Row,
} from './metrics-harness'

const RANGE = { from: '2026-03-01', to: '2026-03-15' }
const usd = (amount: number) => ({ amount, currency: 'USD' })

const SHIPMENTS: Row[] = [
  {
    id: 's1',
    status: 'DELIVERED',
    carrierId: 'c-ups',
    serviceCode: 'ups_ground',
    warehouseId: 'wh1',
    createdAt: '2026-03-01T10:00:00Z',
    estimatedDeliveryAt: '2026-03-05',
    actualDeliveryAt: '2026-03-04T12:00:00Z',
    cost: usd(1000),
  },
  {
    id: 's2',
    status: 'DELIVERED',
    carrierId: 'c-ups',
    serviceCode: 'ups_ground',
    warehouseId: 'wh1',
    createdAt: '2026-03-02T10:00:00Z',
    estimatedDeliveryAt: '2026-03-05',
    actualDeliveryAt: '2026-03-05T18:00:00Z',
    cost: usd(1200),
  },
  {
    id: 's3',
    status: 'DELIVERED',
    carrierId: 'c-ups',
    serviceCode: 'ups_2day',
    createdAt: '2026-03-03T00:00:00Z',
    estimatedDeliveryAt: '2026-03-06',
    actualDeliveryAt: '2026-03-08T00:00:00Z',
    cost: usd(800),
  },
  {
    id: 's4',
    status: 'DELIVERED',
    carrierId: 'c-fdx',
    serviceCode: 'fedex_air',
    createdAt: '2026-03-01T00:00:00Z',
    estimatedDeliveryAt: '2026-03-03',
    actualDeliveryAt: '2026-03-02T00:00:00Z',
    cost: usd(3000),
  },
  {
    id: 's5',
    status: 'DELIVERED',
    carrierId: 'c-fdx',
    serviceCode: 'fedex_air',
    createdAt: '2026-03-04T12:00:00Z',
    actualDeliveryAt: '2026-03-10T12:00:00Z',
    cost: { amount: 2500, currency: 'EUR' },
  },
  { id: 's6', status: 'DELIVERED', createdAt: '2026-03-05T09:00:00Z' },
  {
    id: 's7',
    status: 'IN_TRANSIT',
    carrierId: 'c-ups',
    createdAt: '2026-03-06T09:00:00Z',
    updatedAt: '2026-03-06T09:00:00Z',
    cost: usd(900),
  },
  {
    id: 's8',
    status: 'OUT_FOR_DELIVERY',
    carrierId: 'c-fdx',
    createdAt: '2026-03-10T09:00:00Z',
    updatedAt: '2026-03-17T09:00:00Z',
  },
  {
    id: 's9',
    status: 'EXCEPTION',
    carrierId: 'c-ups',
    createdAt: '2026-03-08T09:00:00Z',
    updatedAt: '2026-03-01T09:00:00Z',
  },
  {
    id: 's10',
    status: 'LABEL_CREATED',
    carrierId: 'c-fdx',
    createdAt: '2026-03-12T09:00:00Z',
    updatedAt: '2026-02-10T09:00:00Z',
    cost: usd(700),
  },
  { id: 's11', status: 'RETURNED', carrierId: 'c-ups', createdAt: '2026-03-09T09:00:00Z' },
  { id: 's12', status: 'CANCELLED', carrierId: 'c-fdx', createdAt: '2026-03-11T09:00:00Z' },
  { id: 's13', status: 'UNKNOWN', createdAt: '2026-03-13T09:00:00Z' },
  {
    id: 's14',
    status: 'DELIVERED',
    carrierId: 'c-ups',
    createdAt: '2026-02-15T09:00:00Z',
    estimatedDeliveryAt: '2026-02-18',
    actualDeliveryAt: '2026-02-20T09:00:00Z',
    cost: usd(5000),
  },
  {
    id: 's15',
    status: 'PENDING',
    carrierId: 'c-ups',
    createdAt: '2026-03-14T09:00:00Z',
    updatedAt: '2026-03-14T09:00:00Z',
  },
  {
    id: 's16',
    status: 'IN_TRANSIT',
    carrierId: 'c-fdx',
    createdAt: '2026-03-16T09:00:00Z',
    updatedAt: '2026-03-11T09:00:00Z',
  },
  {
    id: 's17',
    status: 'IN_TRANSIT',
    carrierId: 'c-ups',
    createdAt: '2026-03-16T09:00:00Z',
    updatedAt: '2026-03-10T09:00:00Z',
  },
]

describe.each(BACKENDS)('logistics metrics ($name)', (backend) => {
  let h: Harness

  beforeEach(async () => {
    h = await openHarness(backend)
    const a = await h.connect('easypost', 'logistics', 'tenant-a', 'Ship A')
    const b = await h.connect('easypost', 'logistics', 'tenant-b', 'Ship B')
    await h.put('logistics', 'easypost', a, 'shipments', SHIPMENTS)
    await h.put('logistics', 'easypost', a, 'carriers', [
      { id: 'c-ups', name: 'UPS' },
      { id: 'c-fdx', name: 'FedEx' },
    ])
    await h.put('logistics', 'easypost', a, 'warehouses', [
      { id: 'wh1', name: 'Reno DC' },
    ])
    await h.put('logistics', 'easypost', a, 'labels', [
      { id: 'l1', status: 'CREATED', format: 'PDF', createdAt: '2026-03-02T10:00:00Z', cost: usd(400) },
      { id: 'l2', status: 'VOIDED', format: 'PDF', createdAt: '2026-03-02T11:00:00Z', cost: usd(500) },
      { id: 'l3', status: 'REFUNDED', format: 'ZPL', createdAt: '2026-03-03T11:00:00Z', cost: usd(600) },
      { id: 'l4', status: 'USED', format: 'PDF', createdAt: '2026-03-04T11:00:00Z', cost: usd(300) },
      { id: 'l5', status: 'VOIDED', format: 'PDF', createdAt: '2026-02-01T11:00:00Z', cost: usd(9999) },
    ])
    await h.put('logistics', 'easypost', a, 'trackingevents', [
      { id: 'te1', status: 'FAILURE', occurredAt: '2026-03-05T10:00:00Z' },
      { id: 'te2', status: 'FAILURE', occurredAt: '2026-03-05T15:00:00Z' },
      { id: 'te3', status: 'IN_TRANSIT', occurredAt: '2026-03-05T16:00:00Z' },
      { id: 'te4', status: 'FAILURE', occurredAt: '2026-03-07T10:00:00Z' },
    ])
    await h.put('logistics', 'easypost', b, 'shipments', [
      { id: 'tb1', status: 'DELIVERED', carrierId: 'c-ups', createdAt: '2026-03-02T10:00:00Z', cost: usd(777) },
    ])
    await h.put('logistics', 'easypost', b, 'carriers', [
      { id: 'c-ups', name: 'LEAKED' },
    ])
  })

  afterEach(async () => {
    await h.handle.close()
  })

  it('registers every logistics id under its own vertical', () => {
    const own = RESOURCE_METRICS.filter((m) => m.vertical === 'logistics')
    expect(own.length).toBeGreaterThanOrEqual(40)
    for (const m of own) expect(m.id.startsWith('logistics.')).toBe(true)
  })

  describe('volume and mix', () => {
    it('counts shipments in the range and by status in lifecycle order', async () => {
      expect((await h.run('logistics.shipments_total', RANGE)).value).toBe(14)
      const st = await h.run('logistics.shipments_by_status', RANGE)
      expect(points(st)).toMatchObject({
        PENDING: 1,
        LABEL_CREATED: 1,
        IN_TRANSIT: 1,
        OUT_FOR_DELIVERY: 1,
        DELIVERED: 6,
        EXCEPTION: 1,
        RETURNED: 1,
        CANCELLED: 1,
        UNKNOWN: 1,
      })
      expect(series(st).points.map((p) => p.x)).toEqual([
        'PENDING',
        'LABEL_CREATED',
        'IN_TRANSIT',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'EXCEPTION',
        'RETURNED',
        'CANCELLED',
        'UNKNOWN',
      ])
      expect((await h.run('logistics.shipments_total', RANGE, SCOPE_A)).value).toBe(14)
    })

    it('labels carriers from the in-scope connection only', async () => {
      const a = await h.run('logistics.shipments_by_carrier', RANGE)
      expect(points(a)).toEqual({ UPS: 7, FedEx: 5, '(none)': 2 })
      expect(JSON.stringify(a)).not.toContain('LEAKED')
      const b = await h.run('logistics.shipments_by_carrier', RANGE, SCOPE_B)
      expect(points(b)).toEqual({ LEAKED: 1 })
      const split = await h.run('logistics.carrier_daily_volume', RANGE)
      expect(split.series.map((s) => s.name).sort()).toEqual(['(none)', 'FedEx', 'UPS'])
      expect(JSON.stringify(split)).not.toContain('LEAKED')
    })

    it('breaks down service, warehouse and weekday/hour', async () => {
      expect(points(await h.run('logistics.shipments_by_service', RANGE))).toMatchObject({
        ups_ground: 2,
        ups_2day: 1,
        fedex_air: 2,
      })
      expect(points(await h.run('logistics.shipments_by_warehouse', RANGE))).toEqual({
        'Reno DC': 2,
        '(none)': 12,
      })
      const heat = await h.run('logistics.shipping_volume_heatmap', RANGE)
      expect(heat.matrix!.cells.reduce((n, c) => n + c[2], 0)).toBe(14)
      // Mon 03-02 10:00: s2 alone at that hour.
      const hourIdx = heat.matrix!.x.indexOf('10:00 UTC')
      const monIdx = heat.matrix!.y.indexOf('Mon')
      expect(heat.matrix!.cells.find((c) => c[0] === hourIdx && c[1] === monIdx)![2]).toBe(1)
    })
  })

  describe('delivery performance', () => {
    it('compares actual to estimated delivery by day', async () => {
      const r = await h.run('logistics.on_time_rate', RANGE)
      // eligible: s1 (03-04 <= 03-05), s2 (03-05 18:00 is still the 5th), s3 late, s4 early
      expect(kpi(r, 'numerator')).toBe(3)
      expect(kpi(r, 'denominator')).toBe(4)
      expect(r.value).toBe(75)
      // delivered in range: s1..s5; s5 has no ETA, s14 is outside the range
      expect(r.coverage).toEqual({ eligible: 4, total: 5 })
      expect(r.thresholds).toMatchObject({ direction: 'below' })
      const day = points(r)
      expect(day['2026-03-04']).toBe(100)
      expect(day['2026-03-08']).toBe(0)
      expect(day['2026-03-09']).toBeNull()
    })

    it('counts late deliveries per day, by carrier, and as a trend', async () => {
      const late = await h.run('logistics.late_shipments_per_day', RANGE)
      expect(late.value).toBe(1)
      expect(nonZero(late)).toEqual({ '2026-03-08': 1 })
      expect(points(await h.run('logistics.late_deliveries_by_carrier', RANGE))).toEqual({ UPS: 1 })
      const trend = await h.run('logistics.late_delivery_trend', RANGE)
      expect(trend.value).toBe(25)
      expect(kpi(trend, 'numerator')).toBe(1)
      expect(kpi(trend, 'denominator')).toBe(4)
    })

    it('reads the delivery-versus-promise distribution', async () => {
      const r = await h.run('logistics.delivery_vs_promise', RANGE)
      // est → actual in days: s1 −0.5, s2 +0.75, s3 +2, s4 −1
      expect(kpi(r, 'n')).toBe(4)
      expect(r.stats![0]).toMatchObject({ group: 'All', n: 4, min: -1, max: 2 })
      expect(r.stats![0]!.mean).toBe(0.31)
      expect(r.value).toBe(0.13) // p50 = (−0.5 + 0.75) / 2
      // bands: <−7, −7…−2, −2…0, 0…1, 1…3, 3…7, ≥7
      expect(r.series[0]!.points.map((p) => p.y)).toEqual([0, 0, 2, 1, 1, 0, 0])
    })

    it('rates exceptions and returns of shipments created in the range', async () => {
      const ex = await h.run('logistics.exception_rate', RANGE)
      expect(kpi(ex, 'numerator')).toBe(1)
      expect(kpi(ex, 'denominator')).toBe(14)
      expect(ex.value).toBe(7.14)
      expect((await h.run('logistics.returns_rate', RANGE)).value).toBe(7.14)
      expect(points(await h.run('logistics.exceptions_by_carrier', RANGE))).toEqual({ UPS: 1 })
    })

    it('counts FAILURE tracking events per day', async () => {
      const r = await h.run('logistics.exceptions_per_day', RANGE)
      expect(r.value).toBe(3)
      expect(nonZero(r)).toEqual({ '2026-03-05': 2, '2026-03-07': 1 })
    })
  })

  describe('transit time', () => {
    it('computes percentiles and the histogram by hand', async () => {
      const r = await h.run('logistics.avg_transit_days', RANGE)
      // created → delivered, days: s4 1, s1 3.0833, s2 3.3333, s3 5, s5 6
      expect(kpi(r, 'n')).toBe(5)
      expect(r.value).toBe(3.68) // mean 18.41667 / 5
      expect(kpi(r, 'p50')).toBe(3.33)
      expect(kpi(r, 'p90')).toBe(5.6) // 5 + 0.6 × (6 − 5)
      // <1, 1–2, 2–3, 3–5, 5–7, 7–10, 10–14, ≥14
      expect(r.series[0]!.points.map((p) => p.y)).toEqual([0, 1, 0, 2, 2, 0, 0, 0])
      const hist = await h.run('logistics.transit_histogram', RANGE)
      expect(hist.series[0]!.points.map((p) => p.y)).toEqual([0, 1, 0, 2, 2, 0, 0, 0])
      expect(hist.metric.charts[0]).toBe('histogram')
    })

    it('gives one boxplot row per carrier, named from the in-scope connection', async () => {
      const r = await h.run('logistics.transit_by_carrier', RANGE)
      expect(r.metric.charts[0]).toBe('boxplot')
      const by = Object.fromEntries(r.stats!.map((s) => [s.group, s]))
      expect(Object.keys(by).sort()).toEqual(['All', 'FedEx', 'UPS'])
      // UPS: 3.0833, 3.3333, 5
      expect(by['UPS']).toMatchObject({ n: 3, min: 3.08, p25: 3.21, p50: 3.33, p75: 4.17, p90: 4.67, max: 5, mean: 3.81 })
      // FedEx: 1, 6
      expect(by['FedEx']).toMatchObject({ n: 2, min: 1, p50: 3.5, max: 6, mean: 3.5 })
      expect(JSON.stringify(r)).not.toContain('LEAKED')
      const svc = await h.run('logistics.transit_by_service', RANGE)
      expect(svc.stats!.find((s) => s.group === 'ups_2day')).toMatchObject({ n: 1, p50: 5 })
    })
  })

  describe('pipeline and labels', () => {
    it('shows the in-flight pipeline as of now, whatever the range', async () => {
      const wide = await h.run('logistics.pipeline_snapshot', RANGE)
      const past = await h.run('logistics.pipeline_snapshot', { from: '2025-01-01', to: '2025-01-31' })
      const expected = { LABEL_CREATED: 1, IN_TRANSIT: 3, OUT_FOR_DELIVERY: 1, EXCEPTION: 1 }
      expect(points(wide)).toEqual(expected)
      expect(points(past)).toEqual(expected)
      expect(past.range.from).toBe('2026-03-18')
      expect((await h.run('logistics.shipments_in_flight', { from: '2025-01-01', to: '2025-01-31' })).value).toBe(6)
    })

    it('counts labels and measures leakage', async () => {
      const per = await h.run('logistics.labels_per_day', RANGE)
      expect(nonZero(per, 'CREATED')).toEqual({ '2026-03-02': 1 })
      expect(nonZero(per, 'VOIDED')).toEqual({ '2026-03-02': 1 })
      expect(points(await h.run('logistics.labels_by_format', RANGE))).toEqual({ PDF: 3, ZPL: 1 })
      const rate = await h.run('logistics.label_leakage_rate', RANGE)
      expect(kpi(rate, 'numerator')).toBe(2)
      expect(kpi(rate, 'denominator')).toBe(4)
      expect(rate.value).toBe(50)
      // l2 5.00 + l3 6.00; l5 is outside the range
      const spend = await h.run('logistics.label_leakage_spend', RANGE)
      expect(spend.totals).toEqual([{ currency: 'USD', amount: 11, amountMinor: 1100 }])
    })
  })

  describe('cost', () => {
    it('keeps spend per currency, never summed across them', async () => {
      const r = await h.run('logistics.shipping_spend', RANGE)
      expect(r.currencies).toEqual(['EUR', 'USD'])
      expect(r.totals).toEqual([
        { currency: 'EUR', amount: 25, amountMinor: 2500 },
        { currency: 'USD', amount: 76, amountMinor: 7600 },
      ])
      expect(r.masked).toBe(false)
      const usdOnly = await h.run('logistics.shipping_spend', { ...RANGE, currency: 'USD' })
      expect(usdOnly.totals).toEqual([{ currency: 'USD', amount: 76, amountMinor: 7600 }])
      const daily = await h.run('logistics.spend_per_day', RANGE)
      expect(daily.series.map((s) => s.currency).sort()).toEqual(['EUR', 'USD'])
      expect(nonZero(daily, 'USD')).toMatchObject({ '2026-03-01': 40, '2026-03-02': 12, '2026-03-03': 8 })
    })

    it('averages over shipments that report a cost, per currency', async () => {
      const r = await h.run('logistics.cost_per_shipment', RANGE)
      // USD: 7600 / 6 = 1266.67 minor; EUR: 2500 / 1. s6 and the rest have no cost.
      const byCur = Object.fromEntries(r.totals!.map((t) => [t.currency, t]))
      expect(byCur['EUR']!.amount).toBe(25)
      expect(byCur['USD']!.amount).toBeCloseTo(12.666667, 5)
      expect(r.coverage).toEqual({ eligible: 7, total: 14 })
      const byCarrier = await h.run('logistics.cost_per_shipment_by_carrier', { ...RANGE, currency: 'USD' })
      const rows = rowsByLabel(byCarrier)
      // UPS USD: (1000 + 1200 + 800 + 900) / 4 = 975; FedEx USD: (3000 + 700) / 2 = 1850
      expect(rows['UPS']!['value']).toBe(9.75)
      expect(rows['FedEx']!['value']).toBe(18.5)
    })

    it('splits spend by carrier and service, and bands cost', async () => {
      const r = await h.run('logistics.cost_by_carrier', { ...RANGE, currency: 'USD' })
      expect(points(r, 'USD')).toEqual({ UPS: 39, FedEx: 37 })
      const svc = await h.run('logistics.cost_by_service', { ...RANGE, currency: 'USD' })
      expect(points(svc, 'USD')).toEqual({ fedex_air: 30, ups_ground: 22, ups_2day: 8, '(none)': 16 })
    })

    it('bands cost per currency in major units', async () => {
      const r = await h.run('logistics.cost_distribution', RANGE)
      const labels = ['< 5', '5–10', '10–15', '15–25', '25–50', '50–100', '≥ 100']
      expect(r.series.find((s) => s.currency === 'USD')!.points).toEqual(
        labels.map((x, i) => ({ x, y: [0, 3, 2, 0, 1, 0, 0][i]! })),
      )
      expect(r.series.find((s) => s.currency === 'EUR')!.points.map((p) => p.y)).toEqual([0, 0, 0, 0, 1, 0, 0])
    })

    it('withholds every cost metric when financial values are masked', async () => {
      const r = await h.engine.run('logistics.shipping_spend', { tenants: ['tenant-a'], maskFinancial: true }, RANGE)
      expect(r.masked).toBe(true)
      expect(r.totals).toEqual([])
      // Volume metrics are not financial.
      const v = await h.engine.run('logistics.shipments_total', { tenants: ['tenant-a'], maskFinancial: true }, RANGE)
      expect(v.masked).toBe(false)
      expect(v.value).toBe(14)
    })
  })

  describe('risk', () => {
    it('computes carrier concentration by shipments: shares, top-1 and HHI', async () => {
      const r = await h.run('logistics.carrier_concentration_shipments', RANGE)
      // 12 attributed shipments: UPS 7, FedEx 5. The 2 with no carrier are left out.
      expect(r.value).toBe(58.33)
      expect(kpi(r, 'hhi')).toBe(5139) // (7² + 5²) / 12² × 10 000 = 5138.9
      expect(kpi(r, 'effective_n')).toBe(1.95)
      expect(kpi(r, 'groups')).toBe(2)
      expect(kpi(r, 'unattributed')).toBe(2)
      expect(kpi(r, 'top3_share')).toBe(100)
      const rows = rowsByLabel(r)
      expect(rows['UPS']).toMatchObject({ rank: 1, value: 7, share: 58.33 })
      expect(rows['FedEx']).toMatchObject({ rank: 2, share: 41.67, cumulative: 100 })
    })

    it('computes carrier concentration by spend within each currency', async () => {
      const r = await h.run('logistics.carrier_concentration_spend', RANGE)
      // USD: UPS 3900, FedEx 3700 of 7600. EUR: FedEx alone.
      expect(kpi(r, 'top1_share', 'USD')).toBe(51.32)
      expect(kpi(r, 'hhi', 'USD')).toBe(5003) // 28.9M / 57.76M
      expect(kpi(r, 'hhi', 'EUR')).toBe(10000)
      expect(kpi(r, 'top1_share', 'EUR')).toBe(100)
      expect(r.value).toBeNull() // two currencies: no single headline
    })

    it('finds stuck shipments with a snapshot and older_than_days on updatedAt', async () => {
      // in flight with no change since before 03-11: s7 (03-06), s9 (03-01), s10 (02-10) and
      // s17 (03-10, 8 days). s16 changed exactly 7 days ago and s8 yesterday: not stuck.
      const r = await h.run('logistics.stuck_in_transit', RANGE)
      expect(r.value).toBe(4)
      expect((await h.run('logistics.stuck_in_transit', { from: '2024-01-01', to: '2024-01-31' })).value).toBe(4)
      const age = await h.run('logistics.stuck_by_age', RANGE)
      // days since update: s8 1, s16 7, s17 8, s7 12, s9 17, s10 36
      expect(age.series[0]!.points).toEqual([
        { x: '0–7 days', y: 2 },
        { x: '8–14 days', y: 2 },
        { x: '15–30 days', y: 1 },
        { x: '31+ days', y: 1 },
      ])
      expect(points(await h.run('logistics.stuck_by_carrier', RANGE))).toEqual({ UPS: 3, FedEx: 1 })
      // silent for over 21 days and not finished: only s10 (02-10)
      expect((await h.run('logistics.lost_shipments', RANGE)).value).toBe(1)
    })

    it('reports data-quality rates', async () => {
      // estimated date present on s1–s4 only: 10 of 14 lack one
      expect((await h.run('logistics.missing_eta_rate', RANGE)).value).toBe(71.43)
      expect((await h.run('logistics.missing_carrier_rate', RANGE)).value).toBe(14.29)
      expect((await h.run('logistics.unknown_status_rate', RANGE)).value).toBe(7.14)
      // DELIVERED and created in the range: s1–s6, of which s6 has no delivery date
      const d = await h.run('logistics.delivered_without_date_rate', RANGE)
      expect(kpi(d, 'denominator')).toBe(6)
      expect(d.value).toBe(16.67)
    })
  })
})
