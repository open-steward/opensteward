/**
 * Ecommerce catalog metrics (`ecommerce.*`) over seeded canonical records.
 * Runs on SQLite always and on Postgres when TEST_DATABASE_URL is set.
 *
 * Two connections (Shopify and WooCommerce, one tenant), two currencies (USD,
 * SEK). Every expectation is computed by hand from the seed below. "Now" is
 * Wednesday 2026-03-18 12:00 UTC and the range is 2026-03-01..2026-03-18.
 *
 * Money is `{ amount, currency }` in minor units and is asserted per
 * currency; ratios of amounts are per currency; nothing is added across USD
 * and SEK. Enums are UPPER case.
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
import type { MetricResult } from '../../src/data-access/metrics/types'

const SECRET = 'b'.repeat(40)
const NOW = new Date('2026-03-18T12:00:00Z')
const MARCH = { from: '2026-03-01', to: '2026-03-18' }
const ALL = { tenants: '*' as const }

const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env['TEST_DATABASE_URL']) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env['TEST_DATABASE_URL'] }),
  })
}

type Row = { id: string } & Record<string, unknown>

const usd = (amount: number) => ({ amount, currency: 'USD' })
const sek = (amount: number) => ({ amount, currency: 'SEK' })

// Shopify orders. In range: o1-o9 (USD except o6 o7 SEK); o10 is February.
//   cancelled: o5, o8 (o8 also VOIDED)     refunded: o3 (partly), o7
const ORDERS_SHOPIFY: Row[] = [
  {
    id: 'o1',
    createdAt: '2026-03-01T09:00:00Z',
    financialStatus: 'PAID',
    fulfillmentStatus: 'UNFULFILLED',
    customerId: 'k1',
    totalPrice: usd(10000),
    subtotalPrice: usd(8500),
    totalShipping: usd(500),
    totalTax: usd(1000),
    totalDiscounts: usd(1000),
    discountCodes: ['SAVE10'],
  },
  {
    id: 'o2',
    createdAt: '2026-03-02T10:00:00Z',
    financialStatus: 'PAID',
    fulfillmentStatus: 'FULFILLED',
    customerId: 'k1',
    totalPrice: usd(5000),
    subtotalPrice: usd(4600),
    totalShipping: usd(0),
    totalTax: usd(400),
    totalDiscounts: usd(0),
  },
  {
    id: 'o3',
    createdAt: '2026-03-03T15:00:00Z',
    financialStatus: 'PARTIALLY_REFUNDED',
    fulfillmentStatus: 'FULFILLED',
    customerId: 'k2',
    totalPrice: usd(20000),
    totalDiscounts: usd(2000),
    discountCodes: ['SAVE10', 'VIP'],
  },
  {
    id: 'o4',
    createdAt: '2026-03-05T09:00:00Z',
    financialStatus: 'PENDING',
    fulfillmentStatus: 'UNFULFILLED',
    totalPrice: usd(3000),
  },
  {
    id: 'o5',
    createdAt: '2026-03-05T09:00:00Z',
    financialStatus: 'PAID',
    fulfillmentStatus: 'UNFULFILLED',
    customerId: 'k3',
    totalPrice: usd(4000),
    cancelledAt: '2026-03-06T09:00:00Z',
    cancelReason: 'customer',
  },
  {
    id: 'o6',
    createdAt: '2026-03-04T09:00:00Z',
    financialStatus: 'PAID',
    fulfillmentStatus: 'PARTIAL',
    customerId: 'k4',
    totalPrice: sek(100000),
  },
  {
    id: 'o7',
    createdAt: '2026-03-07T09:00:00Z',
    financialStatus: 'REFUNDED',
    fulfillmentStatus: 'FULFILLED',
    customerId: 'k4',
    totalPrice: sek(50000),
  },
  {
    id: 'o8',
    createdAt: '2026-03-08T09:00:00Z',
    financialStatus: 'VOIDED',
    fulfillmentStatus: 'UNFULFILLED',
    customerId: 'k5',
    totalPrice: usd(6000),
    cancelledAt: '2026-03-08T11:00:00Z',
    cancelReason: 'fraud',
  },
  {
    id: 'o9',
    createdAt: '2026-03-17T09:00:00Z',
    financialStatus: 'AUTHORIZED',
    fulfillmentStatus: 'UNFULFILLED',
    customerId: 'k1',
    totalPrice: usd(8000),
  },
  {
    id: 'o10',
    createdAt: '2026-02-10T09:00:00Z',
    financialStatus: 'PAID',
    fulfillmentStatus: 'FULFILLED',
    customerId: 'k1',
    totalPrice: usd(999),
  },
]
const ORDERS_WOO: Row[] = [
  {
    id: 'o11',
    createdAt: '2026-03-15T20:00:00Z',
    financialStatus: 'PAID',
    fulfillmentStatus: 'UNFULFILLED',
    customerId: 'k1',
    totalPrice: usd(30000),
  },
  {
    id: 'o12',
    createdAt: '2026-03-16T10:00:00Z',
    financialStatus: 'PENDING',
    fulfillmentStatus: 'UNFULFILLED',
    totalPrice: sek(25000),
  },
  {
    id: 'o13',
    createdAt: '2026-03-17T23:00:00Z',
    financialStatus: 'PAID',
    fulfillmentStatus: 'FULFILLED',
    customerId: 'k6',
    totalPrice: usd(2000),
  },
]

const REFUNDS: Row[] = [
  {
    id: 'rf1',
    orderId: 'o3',
    amount: usd(5000),
    restock: true,
    processedAt: '2026-03-04T10:00:00Z',
  },
  {
    id: 'rf2',
    orderId: 'o7',
    amount: sek(50000),
    restock: false,
    processedAt: '2026-03-08T10:00:00Z',
  },
  {
    id: 'rf3',
    orderId: 'o1',
    amount: usd(500),
    restock: true,
    processedAt: '2026-03-10T10:00:00Z',
  },
]

const CUSTOMERS: Row[] = [
  {
    id: 'cust1',
    ordersCount: 3,
    totalSpent: usd(50000),
    acceptsMarketing: true,
    createdAt: '2026-03-01T00:00:00Z',
  },
  {
    id: 'cust2',
    ordersCount: 1,
    totalSpent: usd(20000),
    acceptsMarketing: false,
    createdAt: '2026-03-03T00:00:00Z',
  },
  { id: 'cust3', ordersCount: 0, acceptsMarketing: true, createdAt: '2026-03-10T00:00:00Z' },
  {
    id: 'cust4',
    ordersCount: 5,
    totalSpent: sek(150000),
    acceptsMarketing: true,
    createdAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'cust5',
    ordersCount: 2,
    totalSpent: usd(12000),
    acceptsMarketing: false,
    createdAt: '2026-03-16T00:00:00Z',
  },
]

// Deliveries in range: f1 (3d, on time), f2 (6d, late), f3 (2d, due the same day = on time).
const FULFILLMENTS: Row[] = [
  {
    id: 'f1',
    orderId: 'o2',
    status: 'SUCCESS',
    carrier: 'UPS',
    locationId: 'loc1',
    createdAt: '2026-03-02T12:00:00Z',
    shippedAt: '2026-03-02T18:00:00Z',
    deliveredAt: '2026-03-05T18:00:00Z',
    estimatedDeliveryAt: '2026-03-06T18:00:00Z',
  },
  {
    id: 'f2',
    orderId: 'o3',
    status: 'SUCCESS',
    carrier: 'UPS',
    locationId: 'loc1',
    createdAt: '2026-03-03T16:00:00Z',
    shippedAt: '2026-03-04T16:00:00Z',
    deliveredAt: '2026-03-10T16:00:00Z',
    estimatedDeliveryAt: '2026-03-08T16:00:00Z',
  },
  {
    id: 'f3',
    orderId: 'o7',
    status: 'SUCCESS',
    carrier: 'DHL',
    locationId: 'loc2',
    createdAt: '2026-03-07T09:00:00Z',
    shippedAt: '2026-03-07T21:00:00Z',
    deliveredAt: '2026-03-09T21:00:00Z',
    estimatedDeliveryAt: '2026-03-09T00:00:00Z',
  },
  {
    id: 'f4',
    orderId: 'o13',
    status: 'ERROR',
    carrier: 'DHL',
    locationId: 'loc2',
    createdAt: '2026-03-17T23:30:00Z',
  },
  {
    id: 'f5',
    orderId: 'o9',
    status: 'PENDING',
    locationId: 'loc1',
    createdAt: '2026-03-17T10:00:00Z',
  },
]
const LOCATIONS: Row[] = [
  { id: 'loc1', name: 'Main warehouse' },
  { id: 'loc2', name: 'East hub' },
]
const INVENTORY: Row[] = [
  { id: 'il1', variantId: 'v1', locationId: 'loc1', available: 0, committed: 2 },
  { id: 'il2', variantId: 'v2', locationId: 'loc1', available: 3 },
  { id: 'il3', variantId: 'v3', locationId: 'loc2', available: 5 },
  { id: 'il4', variantId: 'v4', locationId: 'loc2', available: 20 },
  { id: 'il5', variantId: 'v5', locationId: 'loc2', available: 0 },
]
const TRANSACTIONS: Row[] = [
  {
    id: 't1',
    orderId: 'o1',
    kind: 'SALE',
    status: 'SUCCESS',
    gateway: 'shopify_payments',
    amount: usd(10000),
    createdAt: '2026-03-01T09:00:00Z',
  },
  {
    id: 't2',
    orderId: 'o2',
    kind: 'SALE',
    status: 'FAILURE',
    gateway: 'shopify_payments',
    amount: usd(5000),
    errorCode: 'card_declined',
    createdAt: '2026-03-02T09:00:00Z',
  },
  {
    id: 't3',
    orderId: 'o3',
    kind: 'AUTHORIZATION',
    status: 'ERROR',
    gateway: 'shopify_payments',
    amount: usd(3000),
    errorCode: 'processing_error',
    createdAt: '2026-03-03T09:00:00Z',
  },
  {
    id: 't4',
    orderId: 'o2',
    kind: 'CAPTURE',
    status: 'SUCCESS',
    gateway: 'paypal',
    amount: usd(5000),
    createdAt: '2026-03-02T10:00:00Z',
  },
  {
    id: 't5',
    orderId: 'o6',
    kind: 'SALE',
    status: 'SUCCESS',
    gateway: 'shopify_payments',
    amount: sek(100000),
    createdAt: '2026-03-04T09:00:00Z',
  },
  {
    id: 't6',
    orderId: 'o1',
    kind: 'REFUND',
    status: 'SUCCESS',
    gateway: 'shopify_payments',
    amount: usd(500),
    createdAt: '2026-03-10T09:00:00Z',
  },
]
const PRODUCTS: Row[] = [
  { id: 'pr1', status: 'ACTIVE' },
  { id: 'pr2', status: 'ACTIVE' },
  { id: 'pr3', status: 'DRAFT' },
  { id: 'pr4', status: 'ARCHIVED' },
]

describe.each(BACKENDS)('ecommerce metrics [$name]', (backend) => {
  let handle: DbHandle
  let engine: MetricsEngine
  const conn = { accessToken: 'x' } as never

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    const creds = await CredentialStore.create(handle, SECRET)
    const resources = await ResourceStore.create(handle)
    const sync = await SyncStore.create(handle)
    const shop = await creds.create('shopify', null, conn, 'Shop', 'ecommerce', 'tenant-a')
    const woo = await creds.create('woocommerce', null, conn, 'Woo', 'ecommerce', 'tenant-a')
    const s = (type: string, rows: Row[]) =>
      resources.upsertMany('ecommerce', 'shopify', shop, type, rows)
    await s('orders', ORDERS_SHOPIFY)
    await resources.upsertMany('ecommerce', 'woocommerce', woo, 'orders', ORDERS_WOO)
    await s('refunds', REFUNDS)
    await s('customers', CUSTOMERS)
    await s('fulfillments', FULFILLMENTS)
    await s('locations', LOCATIONS)
    await s('inventory_levels', INVENTORY)
    await s('transactions', TRANSACTIONS)
    await s('products', PRODUCTS)
    engine = createMetricsEngine({
      credentialStore: creds,
      resourceStore: resources,
      syncStore: sync,
      now: () => NOW,
      resourceMetrics: RESOURCE_METRICS,
    })
  })
  afterEach(async () => {
    await handle.close()
  })

  const run = (id: string, p: Record<string, unknown> = {}) =>
    engine.run(`ecommerce.${id}`, ALL, { ...MARCH, ...p })
  const total = (r: MetricResult, cur: string) => r.totals?.find((t) => t.currency === cur)?.amount
  const kpi = (r: MetricResult, key: string, cur?: string | null) =>
    r.kpis?.find((k) => k.key === key && (cur === undefined || k.currency === cur))?.value
  const sum = (r: MetricResult, cur?: string) =>
    r.series
      .filter((s) => cur === undefined || s.currency === cur)
      .flatMap((s) => s.points)
      .reduce((n, p) => n + (p.y ?? 0), 0)
  const points = (r: MetricResult, cur: string) =>
    Object.fromEntries(r.series.find((s) => s.currency === cur)!.points.map((p) => [p.x, p.y]))
  const byLabel = (r: MetricResult) =>
    Object.fromEntries((r.table?.rows ?? []).map((row) => [String(row['label']), row['value']]))

  // ── Existing metrics keep their ids and values ──────────────────────────

  it('keeps the original ids', async () => {
    const ids = RESOURCE_METRICS.map((d) => d.id)
    for (const id of [
      'ecommerce.orders_total',
      'ecommerce.orders_per_day',
      'ecommerce.revenue_per_day',
      'ecommerce.orders_by_financial_status',
      'ecommerce.revenue_composition',
    ]) {
      expect(ids).toContain(id)
    }
    expect((await run('orders_total')).value).toBe(12)
    expect((await run('orders_total', { currency: 'SEK' })).value).toBe(3)
    expect(byLabel(await run('orders_by_financial_status'))).toEqual({
      PAID: 6,
      PENDING: 2,
      PARTIALLY_REFUNDED: 1,
      REFUNDED: 1,
      VOIDED: 1,
      AUTHORIZED: 1,
    })
  })

  // ── Sales ───────────────────────────────────────────────────────────────

  it('revenue total is per currency and matches revenue per day', async () => {
    const r = await run('revenue_total')
    expect(total(r, 'USD')).toBe(880)
    expect(total(r, 'SEK')).toBe(1750)
    expect(r.currencies).toEqual(['SEK', 'USD'])
    const daily = await run('revenue_per_day')
    expect(sum(daily, 'USD')).toBe(880)
    expect(sum(daily, 'SEK')).toBe(1750)
    const only = await run('revenue_total', { currency: 'SEK' })
    expect(only.totals).toHaveLength(1)
    expect(total(only, 'SEK')).toBe(1750)
  })

  it('net revenue waterfall deducts refunds within each currency', async () => {
    const r = await run('net_revenue')
    expect(points(r, 'USD')).toEqual({ 'Order totals': 880, Refunds: -55, Net: 825 })
    expect(points(r, 'SEK')).toEqual({ 'Order totals': 1750, Refunds: -500, Net: 1250 })
  })

  it('average order value excludes cancelled and voided orders', async () => {
    const r = await run('aov')
    expect(total(r, 'USD')).toBeCloseTo(111.43, 2) // 78000 / 7 countable USD orders
    expect(total(r, 'SEK')).toBeCloseTo(583.33, 2) // 175000 / 3
    const daily = await run('aov_per_day')
    expect(daily.series.map((s) => s.currency).sort()).toEqual(['SEK', 'USD'])
  })

  it('product revenue (subtotals) and orders by currency', async () => {
    expect(sum(await run('revenue_ex_tax_shipping'), 'USD')).toBe(131) // 8500 + 4600
    expect(byLabel(await run('orders_by_currency'))).toEqual({ USD: 9, SEK: 3 })
  })

  it('orders by fulfilment status and by weekday and hour', async () => {
    expect(byLabel(await run('orders_by_fulfillment_status'))).toEqual({
      UNFULFILLED: 7,
      FULFILLED: 4,
      PARTIAL: 1,
    })
    const m = await run('orders_by_weekday_hour')
    expect(m.matrix!.cells.reduce((n, c) => n + c[2], 0)).toBe(12)
    // Sundays 2026-03-01 and 2026-03-08, 09:00 UTC: o1 and o8.
    const x = m.matrix!.x.indexOf('09:00 UTC')
    const y = m.matrix!.y.findIndex((d) => d.startsWith('Sun'))
    expect(m.matrix!.cells.find((c) => c[0] === x && c[1] === y)![2]).toBe(2)
  })

  it('payment failures on transactions, by code, and sales by gateway', async () => {
    const r = await run('payment_failure_rate')
    expect(kpi(r, 'numerator')).toBe(2) // t2 failure, t3 error
    expect(kpi(r, 'denominator')).toBe(4) // t1 t2 t3 t5; capture and refund are not attempts
    expect(r.value).toBe(50)
    expect(byLabel(await run('payment_failures_by_code'))).toEqual({
      card_declined: 1,
      processing_error: 1,
    })
    const g = await run('sales_by_gateway', { currency: 'USD' })
    expect(byLabel(g)).toEqual({ shopify_payments: 100, paypal: 50 })
  })

  it('catalog by status is a snapshot', async () => {
    expect(byLabel(await run('catalog_by_status'))).toEqual({ ACTIVE: 2, DRAFT: 1, ARCHIVED: 1 })
  })

  // ── Customers ───────────────────────────────────────────────────────────

  it('customers: new per day, repeat rate, orders per customer, lifetime spend, opt-in', async () => {
    expect((await run('new_customers_per_day')).value).toBe(4) // cust1 2 3 5 (cust4 is February)
    const rep = await run('repeat_purchase_rate')
    expect(kpi(rep, 'numerator')).toBe(3)
    expect(kpi(rep, 'denominator')).toBe(4)
    expect(rep.value).toBe(75)
    const bands = await run('orders_per_customer')
    expect(bands.series[0]!.points.map((p) => p.y)).toEqual([1, 1, 1, 1, 0])
    const ltv = await run('customer_ltv_simple')
    expect(total(ltv, 'USD')).toBeCloseTo(273.33, 2) // (50000 + 20000 + 12000) / 3
    expect(total(ltv, 'SEK')).toBe(1500)
    expect((await run('marketing_optin_rate')).value).toBe(60)
  })

  it('guest share and top customers: ids only, guests reported apart', async () => {
    expect((await run('guest_order_share')).value).toBeCloseTo(16.67, 2) // o4, o12
    const r = await run('top_customers')
    // USD countable: k1 53000, k2 20000, k6 2000 (guest o4 3000 is unattributed)
    const rows = r.table!.rows.filter((row) => row['currency'] === 'USD')
    expect(rows.map((row) => [row['label'], row['value']])).toEqual([
      ['k1', 530],
      ['k2', 200],
      ['k6', 20],
    ])
    expect(kpi(r, 'unattributed', 'USD')).toBe(30)
    expect(kpi(r, 'top1_share', 'USD')).toBeCloseTo(70.67, 2)
    expect(kpi(r, 'unattributed', 'SEK')).toBe(250)
  })

  // ── Fulfilment ──────────────────────────────────────────────────────────

  it('unfulfilled backlog: paid, not cancelled, per currency; range ignored', async () => {
    const n = await run('unfulfilled_backlog', { from: '2026-03-17', to: '2026-03-17' })
    expect(n.value).toBe(4) // o1 o9 o11 (USD), o6 (SEK); o4 pending, o5 cancelled
    expect((await run('unfulfilled_backlog', { currency: 'SEK' })).value).toBe(1)
    const v = await run('unfulfilled_backlog_value')
    expect(total(v, 'USD')).toBe(480)
    expect(total(v, 'SEK')).toBe(1000)
  })

  it('backlog aging: 0–1, 2–3, 4–7, 8+ days (now injected)', async () => {
    const c = await run('unfulfilled_backlog_aging', { currency: 'USD' })
    expect(c.series[0]!.points.map((p) => [p.x, p.y])).toEqual([
      ['0–1 days', 1], // o9, one day old
      ['2–3 days', 1], // o11, three days old
      ['4–7 days', 0],
      ['8+ days', 1], // o1
    ])
    const v = await run('unfulfilled_backlog_value_aging')
    expect(points(v, 'USD')).toEqual({
      '0–1 days': 80,
      '2–3 days': 300,
      '4–7 days': 0,
      '8+ days': 100,
    })
    expect(points(v, 'SEK')['8+ days']).toBe(1000)
  })

  it('fulfilments by status, carrier and location (labels from the locations resource)', async () => {
    expect(byLabel(await run('fulfillments_by_status'))).toEqual({
      SUCCESS: 3,
      ERROR: 1,
      PENDING: 1,
    })
    expect(byLabel(await run('fulfillments_by_carrier'))).toMatchObject({
      UPS: 2,
      DHL: 2,
      '(none)': 1,
    })
    expect(byLabel(await run('fulfillments_by_location'))).toEqual({
      'Main warehouse': 3,
      'East hub': 2,
    })
  })

  it('fulfilment ship time, delivery time and late delivery rate', async () => {
    const ship = await run('fulfillment_ship_time')
    expect(ship.value).toBe(14) // 6h, 24h, 12h
    expect(kpi(ship, 'p50')).toBe(12)
    const del = await run('time_to_deliver')
    expect(del.value).toBeCloseTo(3.67, 2) // 3d, 6d, 2d
    const late = await run('late_delivery_rate')
    expect(kpi(late, 'numerator')).toBe(1) // f2; f3 is due the same day it arrives
    expect(kpi(late, 'denominator')).toBe(3)
    expect(late.value).toBeCloseTo(33.33, 2)
  })

  it('stock-outs and low stock', async () => {
    expect((await run('stockouts')).value).toBe(2)
    expect((await run('low_stock')).value).toBe(2)
  })

  // ── Discounts, shipping, tax ────────────────────────────────────────────

  it('discounts: total, rate, share, dependency and codes', async () => {
    expect(total(await run('discount_amount'), 'USD')).toBe(30)
    expect(sum(await run('discounts_total'), 'USD')).toBe(30)
    const rate = await run('discount_rate')
    expect(kpi(rate, 'ratio', 'USD')).toBeCloseTo(3.41, 2) // 3000 / 88000
    const share = await run('discounted_order_share')
    expect(kpi(share, 'numerator')).toBe(2) // o1, o3
    expect(share.value).toBeCloseTo(16.67, 2)
    const dep = await run('discount_dependency')
    expect(kpi(dep, 'ratio', 'USD')).toBeCloseTo(38.46, 2) // 30000 / 78000 countable
    expect(byLabel(await run('orders_by_discount_code'))).toEqual({ SAVE10: 2, VIP: 1 })
  })

  it('shipping and tax per currency', async () => {
    expect(sum(await run('shipping_total'), 'USD')).toBe(5)
    expect(kpi(await run('shipping_share'), 'ratio', 'USD')).toBeCloseTo(0.57, 2) // 500 / 88000
    expect((await run('free_shipping_share')).value).toBe(50) // o2 of o1, o2
    expect(sum(await run('tax_total'), 'USD')).toBe(14)
    expect(kpi(await run('tax_share'), 'ratio', 'USD')).toBeCloseTo(1.59, 2) // 1400 / 88000
  })

  // ── Risk ────────────────────────────────────────────────────────────────

  it('refunds: amount, count, restock, and both refund rates', async () => {
    expect(sum(await run('refund_amount_per_day'), 'USD')).toBe(55)
    expect(sum(await run('refund_amount_per_day'), 'SEK')).toBe(500)
    expect((await run('refunds_per_day')).value).toBe(3)
    expect((await run('refund_restock_rate')).value).toBeCloseTo(66.67, 2)
    const a = await run('refund_rate_amount')
    expect(kpi(a, 'ratio', 'USD')).toBe(6.25) // 5500 / 88000
    expect(kpi(a, 'ratio', 'SEK')).toBeCloseTo(28.57, 2) // 50000 / 175000
    const o = await run('refund_rate_orders')
    expect(kpi(o, 'numerator')).toBe(2) // o3, o7
    expect(kpi(o, 'denominator')).toBe(10) // countable orders
    expect(o.value).toBe(20)
    expect((await run('refund_rate_orders', { currency: 'USD' })).value).toBeCloseTo(14.29, 2)
  })

  it('cancellations: rate, value rate, reasons, timing, fraud proxy', async () => {
    const c = await run('cancellation_rate')
    expect(kpi(c, 'numerator')).toBe(2)
    expect(kpi(c, 'denominator')).toBe(12)
    expect(c.value).toBeCloseTo(16.67, 2)
    const v = await run('cancellation_rate_value')
    expect(kpi(v, 'ratio', 'USD')).toBeCloseTo(11.36, 2) // 10000 / 88000
    expect((await run('cancellations_per_day')).value).toBe(2)
    expect(byLabel(await run('cancellations_by_reason'))).toEqual({ customer: 1, fraud: 1 })
    const t = await run('cancellation_timing')
    expect(t.value).toBe(13) // o5 24h, o8 2h
    const f = await run('fraud_cancellations')
    expect(f.value).toBe(1)
    expect(f.metric.note).toMatch(/proxy/i)
    expect((await run('stockout_cancellations')).value).toBe(0)
    expect((await run('voided_orders')).value).toBe(1)
  })

  it('stuck orders and aged backlog risk (now injected)', async () => {
    const stale = await run('stale_unpaid_orders')
    expect(stale.value).toBe(1) // o4 only: o12 and o9 are younger than 3 days
    expect(stale.metric.note).toMatch(/proxy/i)
    const risk = await run('unfulfilled_backlog_risk')
    expect(risk.value).toBe(2) // o1, o6; o11 is exactly 3 days old
    expect((await run('unfulfilled_backlog_risk', { currency: 'SEK' })).value).toBe(1)
    expect(total(await run('unfulfilled_backlog_risk_value'), 'USD')).toBe(100)
  })

  it('customer concentration: shares, HHI and effective N within each currency', async () => {
    const r = await run('customer_concentration')
    expect(kpi(r, 'top1_share', 'USD')).toBeCloseTo(70.67, 2) // k1 53000 of 75000
    expect(kpi(r, 'top5_share', 'USD')).toBe(100)
    expect(kpi(r, 'hhi', 'USD')).toBe(5712) // (53000² + 20000² + 2000²) / 75000²
    expect(kpi(r, 'groups', 'USD')).toBe(3)
    expect(kpi(r, 'top1_share', 'SEK')).toBe(100)
    expect(kpi(r, 'hhi', 'SEK')).toBe(10000)
    expect(kpi(r, 'effective_n', 'SEK')).toBe(1)
    expect(r.metric.thresholds).toEqual({ warn: 20, crit: 40, direction: 'above' })
    expect(r.metric.note).toMatch(/2500/)
    // Currency filter keeps one currency's shares only.
    const sekOnly = await run('customer_concentration', { currency: 'SEK' })
    expect(sekOnly.kpis!.every((k) => k.currency === 'SEK')).toBe(true)
  })

  it('currency exposure counts orders that stand', async () => {
    expect(byLabel(await run('currency_exposure'))).toEqual({ USD: 7, SEK: 3 })
  })

  it('refund and cancellation leakage waterfall per currency', async () => {
    const r = await run('refund_and_cancel_leakage')
    expect(points(r, 'USD')).toEqual({
      'Gross order value': 880,
      Cancelled: -100, // o5 4000 + o8 6000
      Refunded: -200, // o3, whole order value
      Net: 580,
    })
    expect(points(r, 'SEK')).toEqual({
      'Gross order value': 1750,
      Cancelled: expect.closeTo(0),
      Refunded: -500,
      Net: 1250,
    })
  })

  // ── Catalog shape ───────────────────────────────────────────────────────

  it('every ecommerce metric runs, is sectioned, and money series carry a currency', async () => {
    const defs = RESOURCE_METRICS.filter((d) => d.vertical === 'ecommerce')
    expect(defs.length).toBeGreaterThanOrEqual(60)
    for (const d of defs) {
      expect(d.section, d.id).toBeTruthy()
      const r = await engine.run(d.id, ALL, MARCH)
      expect(r.masked, d.id).toBe(false)
      if (r.metric.money) {
        for (const s of r.series) expect(s.currency, `${d.id}/${s.name}`).not.toBeUndefined()
      }
    }
  })

  it('financial masking withholds money metrics and keeps counts and count ratios', async () => {
    const masked = { tenants: '*' as const, maskFinancial: true }
    expect((await engine.run('ecommerce.revenue_total', masked, MARCH)).masked).toBe(true)
    expect((await engine.run('ecommerce.aov', masked, MARCH)).masked).toBe(true)
    expect((await engine.run('ecommerce.orders_total', masked, MARCH)).masked).toBe(false)
    expect((await engine.run('ecommerce.cancellation_rate', masked, MARCH)).value).toBeCloseTo(
      16.67,
      2,
    )
  })
})
