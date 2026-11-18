/**
 * Inventory metrics against hand-computed values. SQLite always, Postgres when
 * TEST_DATABASE_URL is set.
 *
 * "Now" is Wednesday 2026-03-18 12:00 UTC; the range is 2026-03-01 to 2026-03-15.
 * Stock is a snapshot: those metrics must ignore the range.
 *
 * Stock levels (tenant-a), product:location
 *   sl1 p1:loc1  onHand 100  avail 90  committed 10  incoming 50  reorder 90/200  counted 03-10
 *   sl2 p1:loc2  onHand   5  avail  3  committed  2  incoming 20  reorder 10/50   counted 2025-08-01
 *   sl3 p2:loc1  onHand   0  avail  0  committed  0  incoming 30  reorder 15/100
 *   sl4 p2:loc2  onHand  -4  avail -6  committed  2  incoming  0
 *   sl5 p3:loc1  onHand  20  avail -5  committed 25                             counted 2026-01-01
 *   sl6 p3:loc2  onHand 500  avail 500                            reorder 50/100 counted 2025-12-01
 *
 * Purchase orders (tenant-a), amounts in minor units
 *   po1 sup1 received  USD 100000 ordered 03-01 expected 03-10 received 03-09 10:00
 *   po2 sup1 closed    USD  50000 ordered 03-02 expected 03-08 received 03-12
 *   po3 sup2 sent      USD  30000 ordered 03-03 expected 03-10
 *   po4 sup2 partial   EUR  20000 ordered 03-05 expected 03-25
 *   po5 sup1 sent      USD  10000 ordered 03-06 expected 03-20
 *   po6 sup2 draft     USD  99999 ordered 03-07
 *   po7 sup1 cancelled USD  88888 ordered 03-08
 *   po8 sup2 received  USD  40000 ordered 03-09 (no expected) received 03-14
 *   po9 sup1 sent      USD   5000 ordered 01-01 expected 03-01
 *   po10 sup2 sent     USD   7000 (no ordered) expected 03-17
 *
 * Tenant-b has a location and a supplier with tenant-a's ids and other names.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RESOURCE_METRICS } from '../../src/data-access/metrics/catalog'
import {
  BACKENDS,
  NOW,
  SCOPE_B,
  kpi,
  nonZero,
  openHarness,
  points,
  rowsByLabel,
  series,
  type Harness,
  type Row,
} from './metrics-harness'

const RANGE = { from: '2026-03-01', to: '2026-03-15' }
const FAR_PAST = { from: '2024-01-01', to: '2024-01-31' }

const STOCK: Row[] = [
  {
    id: 'p1:loc1',
    productId: 'p1',
    locationId: 'loc1',
    quantityOnHand: 100,
    quantityAvailable: 90,
    quantityCommitted: 10,
    quantityIncoming: 50,
    reorderPoint: 90,
    reorderQuantity: 200,
    lastCountedAt: '2026-03-10T09:00:00Z',
  },
  {
    id: 'p1:loc2',
    productId: 'p1',
    locationId: 'loc2',
    quantityOnHand: 5,
    quantityAvailable: 3,
    quantityCommitted: 2,
    quantityIncoming: 20,
    reorderPoint: 10,
    reorderQuantity: 50,
    lastCountedAt: '2025-08-01T09:00:00Z',
  },
  {
    id: 'p2:loc1',
    productId: 'p2',
    locationId: 'loc1',
    quantityOnHand: 0,
    quantityAvailable: 0,
    quantityCommitted: 0,
    quantityIncoming: 30,
    reorderPoint: 15,
    reorderQuantity: 100,
  },
  {
    id: 'p2:loc2',
    productId: 'p2',
    locationId: 'loc2',
    quantityOnHand: -4,
    quantityAvailable: -6,
    quantityCommitted: 2,
    quantityIncoming: 0,
  },
  {
    id: 'p3:loc1',
    productId: 'p3',
    locationId: 'loc1',
    quantityOnHand: 20,
    quantityAvailable: -5,
    quantityCommitted: 25,
    lastCountedAt: '2026-01-01T09:00:00Z',
  },
  {
    id: 'p3:loc2',
    productId: 'p3',
    locationId: 'loc2',
    quantityOnHand: 500,
    quantityAvailable: 500,
    reorderPoint: 50,
    reorderQuantity: 100,
    lastCountedAt: '2025-12-01T09:00:00Z',
  },
]

const po = (
  id: string,
  supplierId: string,
  status: string,
  totalAmount: number,
  extra: Record<string, unknown> = {},
  currency = 'USD',
): Row => ({ id, supplierId, status, totalAmount, currency, lines: [], ...extra })

const ORDERS: Row[] = [
  po('po1', 'sup1', 'received', 100000, {
    orderedAt: '2026-03-01T00:00:00Z',
    expectedAt: '2026-03-10',
    receivedAt: '2026-03-09T10:00:00Z',
  }),
  po('po2', 'sup1', 'closed', 50000, {
    orderedAt: '2026-03-02T00:00:00Z',
    expectedAt: '2026-03-08',
    receivedAt: '2026-03-12T00:00:00Z',
  }),
  po('po3', 'sup2', 'sent', 30000, { orderedAt: '2026-03-03T00:00:00Z', expectedAt: '2026-03-10' }),
  po('po4', 'sup2', 'partially_received', 20000, {
    orderedAt: '2026-03-05T00:00:00Z',
    expectedAt: '2026-03-25',
  }, 'EUR'),
  po('po5', 'sup1', 'sent', 10000, { orderedAt: '2026-03-06T00:00:00Z', expectedAt: '2026-03-20' }),
  po('po6', 'sup2', 'draft', 99999, { orderedAt: '2026-03-07T00:00:00Z' }),
  po('po7', 'sup1', 'cancelled', 88888, { orderedAt: '2026-03-08T00:00:00Z' }),
  po('po8', 'sup2', 'received', 40000, {
    orderedAt: '2026-03-09T00:00:00Z',
    receivedAt: '2026-03-14T00:00:00Z',
  }),
  po('po9', 'sup1', 'sent', 5000, { orderedAt: '2026-01-01T00:00:00Z', expectedAt: '2026-03-01' }),
  po('po10', 'sup2', 'sent', 7000, { expectedAt: '2026-03-17' }),
]

const ADJUSTMENTS: Row[] = [
  { id: 'a1', locationId: 'loc1', reason: 'cycle_count', adjustedAt: '2026-03-02T09:00:00Z', lines: [] },
  { id: 'a2', locationId: 'loc1', reason: 'damage', adjustedAt: '2026-03-02T10:00:00Z', lines: [] },
  { id: 'a3', locationId: 'loc1', reason: 'theft', adjustedAt: '2026-03-03T10:00:00Z', lines: [] },
  { id: 'a4', locationId: 'loc2', reason: 'expiration', adjustedAt: '2026-03-05T10:00:00Z', lines: [] },
  { id: 'a5', locationId: 'loc2', reason: 'found', adjustedAt: '2026-03-05T11:00:00Z', lines: [] },
  { id: 'a6', locationId: 'loc2', reason: 'correction', adjustedAt: '2026-03-06T10:00:00Z', lines: [] },
  { id: 'a7', locationId: 'loc2', reason: 'damage', adjustedAt: '2026-02-20T10:00:00Z', lines: [] },
]

const TRANSFERS: Row[] = [
  { id: 't1', fromLocationId: 'loc1', toLocationId: 'loc2', status: 'completed', lines: [], shippedAt: '2026-03-01T10:00:00Z', receivedAt: '2026-03-03T10:00:00Z' },
  { id: 't2', fromLocationId: 'loc1', toLocationId: 'loc2', status: 'completed', lines: [], shippedAt: '2026-03-02T00:00:00Z', receivedAt: '2026-03-08T00:00:00Z' },
  { id: 't3', fromLocationId: 'loc1', toLocationId: 'loc2', status: 'in_transit', lines: [], shippedAt: '2026-03-05T00:00:00Z' },
  { id: 't4', fromLocationId: 'loc1', toLocationId: 'loc2', status: 'in_transit', lines: [], shippedAt: '2026-03-15T00:00:00Z' },
  { id: 't5', fromLocationId: 'loc1', toLocationId: 'loc2', status: 'draft', lines: [] },
  { id: 't6', fromLocationId: 'loc1', toLocationId: 'loc2', status: 'cancelled', lines: [] },
]

describe.each(BACKENDS)('inventory metrics ($name)', (backend) => {
  let h: Harness

  beforeEach(async () => {
    h = await openHarness(backend)
    const a = await h.connect('cin7-core', 'inventory', 'tenant-a', 'Inventory A')
    const b = await h.connect('cin7-core', 'inventory', 'tenant-b', 'Inventory B')
    const up = (rt: string, rows: Row[]) => h.put('inventory', 'cin7-core', a, rt, rows)
    await up('locations', [
      { id: 'loc1', name: 'SF Warehouse' },
      { id: 'loc2', name: 'NYC Store' },
    ])
    await up('suppliers', [
      { id: 'sup1', name: 'Keyboards Inc' },
      { id: 'sup2', name: 'Mice Ltd' },
    ])
    await up('products', [
      { id: 'p1', sku: 'K1', isActive: true, createdAt: '2026-03-02T09:00:00Z' },
      { id: 'p2', sku: 'M1', isActive: true, createdAt: '2026-03-02T15:00:00Z' },
      { id: 'p3', sku: 'X1', isActive: false, createdAt: '2026-02-01T09:00:00Z' },
    ])
    await up('stock-levels', STOCK)
    await up('purchase-orders', ORDERS)
    await up('stock-adjustments', ADJUSTMENTS)
    await up('stock-transfers', TRANSFERS)
    const ub = (rt: string, rows: Row[]) => h.put('inventory', 'cin7-core', b, rt, rows)
    await ub('locations', [{ id: 'loc1', name: 'LEAKED-LOC' }])
    await ub('suppliers', [{ id: 'sup1', name: 'LEAKED-SUP' }])
    await ub('stock-levels', [
      { id: 'pb:loc1', productId: 'pb', locationId: 'loc1', quantityOnHand: 9999, quantityAvailable: 9999 },
    ])
    await ub('purchase-orders', [
      po('pob', 'sup1', 'sent', 123456, { orderedAt: '2026-03-04T00:00:00Z', expectedAt: '2026-03-01' }),
    ])
  })

  afterEach(async () => {
    await h.handle.close()
  })

  it('registers every inventory id under its own vertical', () => {
    const own = RESOURCE_METRICS.filter((m) => m.vertical === 'inventory')
    expect(own.length).toBeGreaterThanOrEqual(40)
    for (const m of own) expect(m.id.startsWith('inventory.')).toBe(true)
  })

  describe('stock position (snapshot: the range is ignored)', () => {
    it('counts active SKUs and new SKUs per day', async () => {
      expect((await h.run('inventory.skus_active', RANGE)).value).toBe(2)
      expect((await h.run('inventory.skus_active', FAR_PAST)).value).toBe(2)
      const r = await h.run('inventory.new_skus_per_day', RANGE)
      expect(r.value).toBe(2)
      expect(nonZero(r)).toEqual({ '2026-03-02': 2 })
    })

    it('sums units on hand, available, committed and incoming', async () => {
      for (const range of [RANGE, FAR_PAST]) {
        expect((await h.run('inventory.units_on_hand', range)).value).toBe(621)
        expect((await h.run('inventory.units_available', range)).value).toBe(582)
        expect((await h.run('inventory.units_committed', range)).value).toBe(39)
        expect((await h.run('inventory.units_incoming', range)).value).toBe(100)
      }
      const snap = await h.run('inventory.units_on_hand', FAR_PAST)
      expect(snap.range).toEqual({ from: '2026-03-18', to: '2026-03-18' })
      expect(snap.metric.snapshot).toBe(true)
      expect(snap.metric.unit).toBe('quantity')
      // Not every platform reports every quantity.
      expect((await h.run('inventory.units_available', RANGE)).coverage).toEqual({ eligible: 6, total: 6 })
      expect((await h.run('inventory.units_committed', RANGE)).coverage).toEqual({ eligible: 5, total: 6 })
      expect((await h.run('inventory.units_incoming', RANGE)).coverage).toEqual({ eligible: 4, total: 6 })
    })

    it('groups units by location name, from the in-scope connection', async () => {
      const r = await h.run('inventory.units_by_location', RANGE)
      expect(points(r)).toEqual({ 'NYC Store': 501, 'SF Warehouse': 120 })
      expect(JSON.stringify(r)).not.toContain('LEAKED')
      expect(points(await h.run('inventory.units_by_location', RANGE, SCOPE_B))).toEqual({
        'LEAKED-LOC': 9999,
      })
    })

    it('buckets cycle-count recency, with "No date" for never counted', async () => {
      const r = await h.run('inventory.count_freshness', RANGE)
      // days since count: sl1 8, sl5 76, sl6 107, sl2 229; sl3 and sl4 never
      expect(r.series[0]!.points).toEqual([
        { x: '0–30 days', y: 1 },
        { x: '31–90 days', y: 1 },
        { x: '91–180 days', y: 1 },
        { x: '181+ days', y: 1 },
        { x: 'No date', y: 2 },
      ])
      expect((await h.run('inventory.stale_counts', RANGE)).value).toBe(1)
    })
  })

  describe('stock health', () => {
    it('finds stock-outs and fully committed stock', async () => {
      expect((await h.run('inventory.stockouts', RANGE)).value).toBe(2) // sl3 (0), sl4 (−4)
      expect(points(await h.run('inventory.stockouts_by_location', FAR_PAST))).toEqual({
        'SF Warehouse': 1,
        'NYC Store': 1,
      })
      expect((await h.run('inventory.fully_committed', RANGE)).value).toBe(1) // sl5
    })

    it('compares available to the reorder point per row', async () => {
      // on hand > 0, reorder point > 0: sl1 90 <= 90 (equal counts), sl2 3 <= 10, sl6 500 > 50
      expect((await h.run('inventory.low_stock', RANGE)).value).toBe(2)
      expect((await h.run('inventory.low_stock', FAR_PAST)).value).toBe(2)
      expect(points(await h.run('inventory.low_stock_by_location', RANGE))).toEqual({
        'SF Warehouse': 1,
        'NYC Store': 1,
      })
      // sl1 has 50 incoming and sl2 has 20
      expect((await h.run('inventory.low_stock_with_incoming', RANGE)).value).toBe(2)
    })

    it('compares committed to on hand', async () => {
      // sl4: 2 > −4, sl5: 25 > 20. sl2: 2 <= 5
      expect((await h.run('inventory.backorder_exposure', RANGE)).value).toBe(2)
    })

    it('flags negative stock, negative availability and the overstock proxy', async () => {
      expect((await h.run('inventory.negative_stock', RANGE)).value).toBe(1)
      expect((await h.run('inventory.negative_available', RANGE)).value).toBe(2)
      // on hand above reorder quantity: only sl6 (500 > 100)
      expect((await h.run('inventory.overstock_proxy', RANGE)).value).toBe(1)
    })

    it('measures stock concentration by location', async () => {
      const r = await h.run('inventory.location_concentration', RANGE)
      // loc2 501 of 621 units, loc1 120: 80.68 %, HHI (501² + 120²) / 621²
      expect(r.value).toBe(80.68)
      expect(kpi(r, 'hhi')).toBe(6882)
      expect(rowsByLabel(r)['NYC Store']).toMatchObject({ rank: 1, value: 501 })
    })
  })

  describe('adjustments and transfers', () => {
    it('counts adjustments per day and by reason', async () => {
      const per = await h.run('inventory.adjustments_per_day', RANGE)
      expect(per.value).toBe(6)
      expect(nonZero(per)).toEqual({ '2026-03-02': 2, '2026-03-03': 1, '2026-03-05': 2, '2026-03-06': 1 })
      const by = await h.run('inventory.adjustments_by_reason', RANGE)
      expect(points(by)).toEqual({
        cycle_count: 1,
        damage: 1,
        theft: 1,
        lost: 0,
        found: 1,
        expiration: 1,
        correction: 1,
        other: 0,
        unknown: 0,
      })
      const split = await h.run('inventory.adjustments_by_reason_per_day', RANGE)
      expect(nonZero(split, 'damage')).toEqual({ '2026-03-02': 1 })
      expect(nonZero(split, 'found')).toEqual({ '2026-03-05': 1 })
    })

    it('counts shrinkage: damage, theft, loss and expiry', async () => {
      expect((await h.run('inventory.shrinkage_adjustments', RANGE)).value).toBe(3)
      const share = await h.run('inventory.shrinkage_share', RANGE)
      expect(kpi(share, 'numerator')).toBe(3)
      expect(kpi(share, 'denominator')).toBe(6)
      expect(share.value).toBe(50)
    })

    it('counts transfers, their status now, their time and the stuck ones', async () => {
      const per = await h.run('inventory.transfers_per_day', RANGE)
      expect(per.value).toBe(4)
      expect(nonZero(per)).toEqual({ '2026-03-01': 1, '2026-03-02': 1, '2026-03-05': 1, '2026-03-15': 1 })
      const st = await h.run('inventory.transfers_by_status', FAR_PAST)
      expect(points(st)).toEqual({ draft: 1, in_transit: 2, completed: 2, cancelled: 1, unknown: 0 })
      const lead = await h.run('inventory.transfer_lead_time', RANGE)
      // t1 2 days, t2 6 days
      expect(lead.value).toBe(4)
      expect(kpi(lead, 'p90')).toBe(5.6)
      expect(lead.series[0]!.points.map((p) => p.y)).toEqual([0, 0, 1, 0, 1, 0, 0])
      // in transit and shipped before 03-11: t3 only (t4 shipped 03-15)
      expect((await h.run('inventory.transfers_stuck', RANGE)).value).toBe(1)
    })
  })

  describe('purchasing', () => {
    it('counts purchase orders by status and per day, and honours the currency filter on counts', async () => {
      const st = await h.run('inventory.po_by_status', RANGE)
      expect(points(st)).toEqual({
        draft: 1,
        sent: 2,
        partially_received: 1,
        received: 2,
        closed: 1,
        cancelled: 1,
        unknown: 0,
      })
      expect(st.currencies).toEqual(['EUR', 'USD'])
      const eur = await h.run('inventory.po_by_status', { ...RANGE, currency: 'EUR' })
      expect(points(eur).partially_received).toBe(1)
      expect(eur.value).toBe(1)
      expect((await h.run('inventory.pos_per_day', RANGE)).value).toBe(8)
    })

    it('sums committed PO spend per currency, leaving out drafts and cancelled orders', async () => {
      const r = await h.run('inventory.po_spend', RANGE)
      // USD: po1 + po2 + po3 + po5 + po8 = 230000; EUR: po4 = 20000. po6, po7 excluded.
      expect(r.totals).toEqual([
        { currency: 'EUR', amount: 200, amountMinor: 20000 },
        { currency: 'USD', amount: 2300, amountMinor: 230000 },
      ])
      const daily = await h.run('inventory.po_spend_per_day', RANGE)
      expect(nonZero(daily, 'USD')).toEqual({
        '2026-03-01': 1000,
        '2026-03-02': 500,
        '2026-03-03': 300,
        '2026-03-06': 100,
        '2026-03-09': 400,
      })
      const avg = await h.run('inventory.avg_po_value', { ...RANGE, currency: 'USD' })
      expect(avg.totals).toEqual([{ currency: 'USD', amount: 460, amountMinor: 46000 }])
    })

    it('breaks spend down by supplier name, from the in-scope connection only', async () => {
      const r = await h.run('inventory.po_spend_by_supplier', { ...RANGE, currency: 'USD' })
      expect(points(r, 'USD')).toEqual({ 'Keyboards Inc': 1600, 'Mice Ltd': 700 })
      expect(JSON.stringify(r)).not.toContain('LEAKED')
      const b = await h.run('inventory.po_spend_by_supplier', RANGE, SCOPE_B)
      expect(points(b, 'USD')).toEqual({ 'LEAKED-SUP': 1234.56 })
    })

    it('reports open and overdue orders as of now', async () => {
      for (const range of [RANGE, FAR_PAST]) {
        // open: po3, po4, po5, po9, po10
        expect((await h.run('inventory.open_pos', range)).value).toBe(5)
        // overdue: expected before 03-18 → po3 (03-10), po9 (03-01), po10 (03-17)
        expect((await h.run('inventory.overdue_pos', range)).value).toBe(3)
      }
      const open = await h.run('inventory.open_po_value', RANGE)
      expect(open.totals).toEqual([
        { currency: 'EUR', amount: 200, amountMinor: 20000 },
        { currency: 'USD', amount: 520, amountMinor: 52000 },
      ])
      const overdue = await h.run('inventory.overdue_po_value', RANGE)
      expect(overdue.totals).toEqual([{ currency: 'USD', amount: 420, amountMinor: 42000 }])
      const age = await h.run('inventory.overdue_pos_by_age', RANGE)
      // days late: po10 1, po3 8, po9 17
      expect(age.series[0]!.points).toEqual([
        { x: '0–7 days', y: 1 },
        { x: '8–14 days', y: 1 },
        { x: '15–30 days', y: 1 },
        { x: '31+ days', y: 0 },
      ])
      expect(points(await h.run('inventory.overdue_pos_by_supplier', RANGE))).toEqual({
        'Mice Ltd': 2,
        'Keyboards Inc': 1,
      })
    })

    it('ages the supply pipeline with an injected now', async () => {
      const r = await h.run('inventory.open_pos_by_expected_date', RANGE)
      // days until expected: po3 −8, po9 −17, po10 −1 (all overdue); po5 +2, po4 +7
      expect(r.series[0]!.points).toEqual([
        { x: 'Today or past', y: 3 },
        { x: '1–7 days', y: 2 },
        { x: '8–14 days', y: 0 },
        { x: '15–30 days', y: 0 },
        { x: '31+ days', y: 0 },
      ])
      expect(NOW.toISOString()).toBe('2026-03-18T12:00:00.000Z')
    })

    it('rates on-time receipt with compare, and reports the missing expected dates', async () => {
      const r = await h.run('inventory.po_on_time_receipt', RANGE)
      // received in range: po1 (03-09 <= 03-10), po2 (03-12 > 03-08), po8 (no expected date)
      expect(kpi(r, 'numerator')).toBe(1)
      expect(kpi(r, 'denominator')).toBe(2)
      expect(r.value).toBe(50)
      expect(r.coverage).toEqual({ eligible: 2, total: 3 })
    })

    it('computes supplier lead time percentiles by hand', async () => {
      const r = await h.run('inventory.supplier_lead_time', RANGE)
      // ordered → received: po8 5, po1 8.4167, po2 10
      expect(kpi(r, 'n')).toBe(3)
      expect(r.value).toBe(7.81)
      expect(kpi(r, 'p50')).toBe(8.42)
      const by = Object.fromEntries(r.stats!.map((s) => [s.group, s]))
      expect(by['Keyboards Inc']).toMatchObject({ n: 2, min: 8.42, max: 10, mean: 9.21 })
      expect(by['Mice Ltd']).toMatchObject({ n: 1, p50: 5 })
      expect(JSON.stringify(r)).not.toContain('LEAKED')
      expect(r.metric.charts[0]).toBe('boxplot')
    })
  })

  describe('risk', () => {
    it('computes supplier concentration of spend within each currency', async () => {
      const r = await h.run('inventory.supplier_concentration', RANGE)
      // USD: Keyboards 160000, Mice 70000 of 230000. EUR: Mice alone.
      expect(kpi(r, 'top1_share', 'USD')).toBe(69.57)
      expect(kpi(r, 'hhi', 'USD')).toBe(5766) // (160² + 70²) / 230² = 0.57656
      expect(kpi(r, 'hhi', 'EUR')).toBe(10000)
      expect(r.value).toBeNull()
      const usd = await h.run('inventory.supplier_concentration', { ...RANGE, currency: 'USD' })
      expect(usd.value).toBe(69.57)
      expect(rowsByLabel(usd)['Keyboards Inc']).toMatchObject({ rank: 1, share: 69.57, cumulative: 69.57 })
    })

    it('computes supplier concentration of order count', async () => {
      const r = await h.run('inventory.supplier_concentration_orders', RANGE)
      // committed in range: Keyboards po1 po2 po5, Mice po3 po4 po8 → 3 and 3
      expect(r.value).toBe(50)
      expect(kpi(r, 'hhi')).toBe(5000)
      expect(kpi(r, 'effective_n')).toBe(2)
    })

    it('shares overdue value of open value within each currency', async () => {
      const r = await h.run('inventory.late_po_exposure', RANGE)
      // USD: 42000 overdue of 52000 open; EUR: none overdue of 20000
      expect(kpi(r, 'ratio', 'USD')).toBe(80.77)
      expect(kpi(r, 'ratio', 'EUR')).toBe(0)
      expect(kpi(r, 'numerator', 'USD')).toBe(420)
      expect(kpi(r, 'denominator', 'USD')).toBe(520)
    })

    it('withholds money metrics when financial values are masked, but not counts', async () => {
      const masked = { tenants: ['tenant-a'], maskFinancial: true }
      const spend = await h.engine.run('inventory.po_spend', masked, RANGE)
      expect(spend.masked).toBe(true)
      expect(spend.totals).toEqual([])
      const conc = await h.engine.run('inventory.supplier_concentration', masked, RANGE)
      expect(conc.masked).toBe(true)
      const count = await h.engine.run('inventory.pos_per_day', masked, RANGE)
      expect(count.masked).toBe(false)
      expect(count.value).toBe(8)
      expect(series(count).points.length).toBeGreaterThan(0)
    })
  })
})
