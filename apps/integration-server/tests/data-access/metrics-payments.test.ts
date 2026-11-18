/**
 * Payments catalog metrics (`payments.*`) over seeded canonical records.
 * Runs on SQLite always and on Postgres when TEST_DATABASE_URL is set.
 *
 * Two connections (Stripe and Adyen, one tenant), two currencies (USD, SEK).
 * Every expectation is computed by hand from the seed below. "Now" is
 * Wednesday 2026-03-18 12:00 UTC and the range is 2026-03-01..2026-03-18.
 *
 * Money is asserted per currency: nothing is added across USD and SEK, and
 * the currency filter narrows totals, series and ratios to one currency.
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

const charge = (
  id: string,
  amount: number,
  currency: string,
  status: string,
  createdAt: string,
  x: Record<string, unknown> = {},
): Row => ({
  id,
  amount,
  currency,
  status,
  createdAt,
  gateway: 'stripe',
  ...x,
})

// Stripe. Captured (succeeded, partially_refunded, refunded, disputed) in range:
//   USD c1 10000, c2 5000, c3 2500, c9 8000 (+ Adyen c11 20000) = 45500
//   SEK c6 100000, c7 50000 = 150000          → 7 captured
// Failed: c4, c5 (USD 4000 + 1500), Adyen c12 (SEK 25000)  → 3 failed
const CHARGES_STRIPE: Row[] = [
  charge('c1', 10000, 'USD', 'succeeded', '2026-03-01T09:00:00Z', { customerId: 'u1' }),
  charge('c2', 5000, 'USD', 'succeeded', '2026-03-02T10:00:00Z', { customerId: 'u1' }),
  charge('c3', 2500, 'USD', 'partially_refunded', '2026-03-02T15:00:00Z', { customerId: 'u2' }),
  charge('c4', 4000, 'USD', 'failed', '2026-03-03T09:00:00Z', {
    customerId: 'u3',
    failureCode: 'card_declined',
  }),
  charge('c5', 1500, 'USD', 'failed', '2026-03-03T11:00:00Z', {
    failureCode: 'insufficient_funds',
  }),
  charge('c6', 100000, 'SEK', 'succeeded', '2026-03-04T09:00:00Z', { customerId: 'u4' }),
  charge('c7', 50000, 'SEK', 'refunded', '2026-03-05T09:00:00Z', { customerId: 'u4' }),
  charge('c8', 3000, 'USD', 'pending', '2026-03-05T12:00:00Z'),
  charge('c9', 8000, 'USD', 'disputed', '2026-03-06T09:00:00Z', { customerId: 'u5' }),
  charge('c10', 999, 'USD', 'succeeded', '2026-02-10T09:00:00Z', { customerId: 'u1' }),
]
const CHARGES_ADYEN: Row[] = [
  charge('c11', 20000, 'USD', 'succeeded', '2026-03-10T20:00:00Z', {
    customerId: 'u1',
    gateway: 'adyen',
  }),
  charge('c12', 25000, 'SEK', 'failed', '2026-03-10T21:00:00Z', {
    gateway: 'adyen',
    failureCode: 'card_declined',
  }),
  charge('c13', 6000, 'USD', 'cancelled', '2026-03-11T09:00:00Z', { gateway: 'adyen' }),
]

// Succeeded, non-release refunds: USD r1 2500 + r5 500 = 3000; SEK r2 50000. r3 failed, r4 a release.
const REFUNDS: Row[] = [
  {
    id: 'r1',
    chargeId: 'c3',
    amount: 2500,
    currency: 'USD',
    status: 'succeeded',
    reason: 'requested_by_customer',
    createdAt: '2026-03-03T09:00:00Z',
  },
  {
    id: 'r2',
    chargeId: 'c7',
    amount: 50000,
    currency: 'SEK',
    status: 'succeeded',
    reason: 'duplicate',
    createdAt: '2026-03-06T09:00:00Z',
  },
  {
    id: 'r3',
    chargeId: 'c4',
    amount: 1000,
    currency: 'USD',
    status: 'failed',
    createdAt: '2026-03-04T09:00:00Z',
  },
  {
    id: 'r4',
    chargeId: 'c8',
    amount: 3000,
    currency: 'USD',
    status: 'succeeded',
    reason: 'expired_uncaptured_charge',
    createdAt: '2026-03-05T09:00:00Z',
  },
  {
    id: 'r5',
    chargeId: 'c1',
    amount: 500,
    currency: 'USD',
    status: 'succeeded',
    createdAt: '2026-03-11T09:00:00Z',
  },
]

// Disputes proper (non-warning) in range: d1, d2, d3, d5 → 4; d4 is an early warning.
const DISPUTES: Row[] = [
  {
    id: 'd1',
    chargeId: 'c9',
    amount: 8000,
    currency: 'USD',
    status: 'needs_response',
    reason: 'fraudulent',
    network: 'visa',
    evidenceDueBy: '2026-03-20T00:00:00Z',
    createdAt: '2026-03-06T10:00:00Z',
  },
  {
    id: 'd2',
    chargeId: 'c1',
    amount: 3000,
    currency: 'USD',
    status: 'won',
    reason: 'product_not_received',
    network: 'mastercard',
    createdAt: '2026-03-10T10:00:00Z',
  },
  {
    id: 'd3',
    chargeId: 'c2',
    amount: 2000,
    currency: 'USD',
    status: 'lost',
    reason: 'fraudulent',
    network: 'visa',
    createdAt: '2026-03-12T10:00:00Z',
  },
  {
    id: 'd4',
    chargeId: 'c6',
    amount: 20000,
    currency: 'SEK',
    status: 'warning_needs_response',
    reason: 'fraudulent',
    network: 'visa',
    createdAt: '2026-03-13T10:00:00Z',
  },
  {
    id: 'd5',
    chargeId: 'c1',
    amount: 1000,
    currency: 'USD',
    status: 'needs_response',
    reason: 'general',
    network: 'visa',
    evidenceDueBy: '2026-03-10T00:00:00Z',
    createdAt: '2026-03-02T10:00:00Z',
  },
]

const PAYOUTS: Row[] = [
  {
    id: 'p1',
    amount: 50000,
    currency: 'USD',
    status: 'paid',
    method: 'standard',
    createdAt: '2026-03-05T00:00:00Z',
    arrivalDate: '2026-03-07T00:00:00Z',
  },
  {
    id: 'p2',
    amount: 30000,
    currency: 'USD',
    status: 'paid',
    method: 'instant',
    createdAt: '2026-03-08T00:00:00Z',
    arrivalDate: '2026-03-08T00:00:00Z',
  },
  {
    id: 'p3',
    amount: 10000,
    currency: 'USD',
    status: 'failed',
    method: 'standard',
    failureCode: 'account_closed',
    createdAt: '2026-03-09T00:00:00Z',
  },
  {
    id: 'p4',
    amount: 80000,
    currency: 'SEK',
    status: 'in_transit',
    method: 'standard',
    createdAt: '2026-03-15T00:00:00Z',
    arrivalDate: '2026-03-20T00:00:00Z',
  },
  {
    id: 'p5',
    amount: 20000,
    currency: 'SEK',
    status: 'cancelled',
    method: 'standard',
    createdAt: '2026-03-12T00:00:00Z',
  },
]

const BALANCE: Row[] = [
  {
    id: 'b1',
    type: 'charge',
    amount: 10000,
    currency: 'USD',
    fee: 320,
    net: 9680,
    createdAt: '2026-03-01T09:00:00Z',
    availableOn: '2026-03-03T09:00:00Z',
  },
  {
    id: 'b2',
    type: 'charge',
    amount: 5000,
    currency: 'USD',
    fee: 175,
    net: 4825,
    createdAt: '2026-03-02T10:00:00Z',
    availableOn: '2026-03-04T10:00:00Z',
  },
  {
    id: 'b3',
    type: 'charge',
    amount: 100000,
    currency: 'SEK',
    fee: 2900,
    net: 97100,
    createdAt: '2026-03-04T09:00:00Z',
    availableOn: '2026-03-09T09:00:00Z',
  },
  {
    id: 'b5',
    type: 'dispute',
    amount: -8000,
    currency: 'USD',
    fee: 1500,
    net: -9500,
    createdAt: '2026-03-06T10:00:00Z',
  },
  { id: 'b6', type: 'charge', amount: 20000, currency: 'USD', createdAt: '2026-03-10T20:00:00Z' },
]

const SUBSCRIPTIONS: Row[] = [
  { id: 's1', status: 'active', currency: 'USD', createdAt: '2026-03-01T00:00:00Z' },
  { id: 's2', status: 'active', currency: 'USD', createdAt: '2026-02-15T00:00:00Z' },
  {
    id: 's3',
    status: 'past_due',
    currency: 'USD',
    dunningState: 'retry_2',
    createdAt: '2026-03-05T00:00:00Z',
  },
  {
    id: 's4',
    status: 'cancelled',
    currency: 'USD',
    dunningState: 'retry_3',
    createdAt: '2026-01-10T00:00:00Z',
    cancelledAt: '2026-03-08T00:00:00Z',
  },
  {
    id: 's5',
    status: 'cancelled',
    currency: 'SEK',
    createdAt: '2026-03-02T00:00:00Z',
    cancelledAt: '2026-03-09T00:00:00Z',
  },
  {
    id: 's6',
    status: 'trialing',
    currency: 'SEK',
    createdAt: '2026-03-15T00:00:00Z',
    trialEnd: '2026-03-30T00:00:00Z',
  },
  {
    id: 's7',
    status: 'active',
    currency: 'SEK',
    createdAt: '2026-02-01T00:00:00Z',
    trialEnd: '2026-03-05T00:00:00Z',
  },
  {
    id: 's8',
    status: 'expired',
    currency: 'USD',
    createdAt: '2026-02-01T00:00:00Z',
    trialEnd: '2026-03-06T00:00:00Z',
  },
]

// today = 2026-03-18. Open: i1 (USD, 8 days late), i2 (USD, 57 days late), i3 (SEK, not yet due).
const INVOICES: Row[] = [
  {
    id: 'i1',
    status: 'open',
    currency: 'USD',
    total: 100000,
    tax: 20000,
    amountPaid: 0,
    amountRemaining: 100000,
    createdAt: '2026-03-01T00:00:00Z',
    dueDate: '2026-03-10T00:00:00Z',
  },
  {
    id: 'i2',
    status: 'open',
    currency: 'USD',
    total: 50000,
    amountRemaining: 50000,
    createdAt: '2026-02-01T00:00:00Z',
    dueDate: '2026-01-20T00:00:00Z',
  },
  {
    id: 'i3',
    status: 'open',
    currency: 'SEK',
    total: 200000,
    amountRemaining: 200000,
    createdAt: '2026-03-15T00:00:00Z',
    dueDate: '2026-03-25T00:00:00Z',
  },
  {
    id: 'i4',
    status: 'paid',
    currency: 'USD',
    total: 30000,
    tax: 5000,
    amountPaid: 30000,
    amountRemaining: 0,
    createdAt: '2026-03-02T10:00:00Z',
    dueDate: '2026-03-12T10:00:00Z',
    paidAt: '2026-03-12T10:00:00Z',
  },
  {
    id: 'i5',
    status: 'paid',
    currency: 'USD',
    total: 10000,
    amountPaid: 10000,
    amountRemaining: 0,
    createdAt: '2026-03-03T00:00:00Z',
    dueDate: '2026-03-05T00:00:00Z',
    paidAt: '2026-03-13T00:00:00Z',
  },
  { id: 'i6', status: 'draft', currency: 'USD', total: 99999, createdAt: '2026-03-04T00:00:00Z' },
  { id: 'i7', status: 'void', currency: 'USD', total: 88888, createdAt: '2026-03-04T00:00:00Z' },
  {
    id: 'i8',
    status: 'uncollectible',
    currency: 'USD',
    total: 7000,
    amountRemaining: 7000,
    createdAt: '2026-03-06T00:00:00Z',
    dueDate: '2026-02-01T00:00:00Z',
  },
]

const CUSTOMERS: Row[] = [
  { id: 'cu1', delinquent: true, balance: 5000, currency: 'USD' },
  { id: 'cu2', delinquent: false, balance: -2000, currency: 'USD' },
  { id: 'cu3', delinquent: true, balance: 30000, currency: 'SEK' },
]

describe.each(BACKENDS)('payments metrics [$name]', (backend) => {
  let handle: DbHandle
  let creds: CredentialStore
  let resources: ResourceStore
  let sync: SyncStore
  let engine: MetricsEngine
  const conn = { accessToken: 'x' } as never

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    creds = await CredentialStore.create(handle, SECRET)
    resources = await ResourceStore.create(handle)
    sync = await SyncStore.create(handle)
    const stripe = await creds.create('stripe', null, conn, 'Stripe', 'payments', 'tenant-a')
    const adyen = await creds.create('adyen', null, conn, 'Adyen', 'payments', 'tenant-a')
    const up = (id: string, type: string, rows: Row[]) =>
      resources.upsertMany('payments', id === stripe ? 'stripe' : 'adyen', id, type, rows)
    await up(stripe, 'charges', CHARGES_STRIPE)
    await up(adyen, 'charges', CHARGES_ADYEN)
    await up(stripe, 'refunds', REFUNDS)
    await up(stripe, 'disputes', DISPUTES)
    await up(stripe, 'payouts', PAYOUTS)
    await up(stripe, 'balance_transactions', BALANCE)
    await up(stripe, 'subscriptions', SUBSCRIPTIONS)
    await up(stripe, 'invoices', INVOICES)
    await up(stripe, 'customers', CUSTOMERS)
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
    engine.run(`payments.${id}`, ALL, { ...MARCH, ...p })
  const total = (r: MetricResult, cur: string) => r.totals?.find((t) => t.currency === cur)?.amount
  const kpi = (r: MetricResult, key: string, cur?: string | null) =>
    r.kpis?.find((k) => k.key === key && (cur === undefined || k.currency === cur))?.value
  const point = (r: MetricResult, x: string, cur?: string) =>
    r.series.find((s) => cur === undefined || s.currency === cur)?.points.find((p) => p.x === x)?.y
  const sum = (r: MetricResult, cur?: string) =>
    r.series
      .filter((s) => cur === undefined || s.currency === cur)
      .flatMap((s) => s.points)
      .reduce((n, p) => n + (p.y ?? 0), 0)
  const byLabel = (r: MetricResult) =>
    Object.fromEntries((r.table?.rows ?? []).map((row) => [String(row['label']), row['value']]))

  // ── Volume ──────────────────────────────────────────────────────────────

  it('gross volume counts captured charges per currency and honours the currency filter', async () => {
    const r = await run('gross_volume')
    expect(total(r, 'USD')).toBe(455)
    expect(total(r, 'SEK')).toBe(1500)
    expect(r.currencies).toEqual(['SEK', 'USD'])
    expect(r.value).toBeNull()
    const usd = await run('gross_volume', { currency: 'USD' })
    expect(usd.totals).toHaveLength(1)
    expect(total(usd, 'USD')).toBe(455)
    expect(usd.currencies).toEqual(['SEK', 'USD'])
  })

  it('gross volume per day: one series per currency, never mixed', async () => {
    const r = await run('gross_volume_per_day')
    expect(r.series.map((s) => s.currency).sort()).toEqual(['SEK', 'USD'])
    expect(sum(r, 'USD')).toBe(455)
    expect(sum(r, 'SEK')).toBe(1500)
    expect(point(r, '2026-03-02', 'USD')).toBe(75) // c2 5000 + c3 2500
  })

  it('charge count is every status; charges by status splits them', async () => {
    const r = await run('charge_count')
    expect(r.value).toBe(12) // c1-c9 + c11-c13, c10 is in February
    expect((await run('charge_count', { currency: 'SEK' })).value).toBe(3) // c6, c7, c12
    const s = byLabel(await run('charges_by_status'))
    expect(s).toMatchObject({
      succeeded: 4,
      failed: 3,
      partially_refunded: 1,
      refunded: 1,
      pending: 1,
      disputed: 1,
      cancelled: 1,
    })
  })

  it('average transaction value is per currency', async () => {
    const r = await run('avg_transaction_value')
    expect(total(r, 'USD')).toBe(91) // 45500 / 5
    expect(total(r, 'SEK')).toBe(750) // 150000 / 2
  })

  it('volume by gateway splits within each currency', async () => {
    const r = await run('volume_by_gateway', { currency: 'USD' })
    expect(byLabel(r)).toEqual({ stripe: 255, adyen: 200 })
  })

  it('net volume waterfall: gross less refunds, disputes and fees per currency', async () => {
    const r = await run('net_volume')
    const usd = r.series.find((s) => s.currency === 'USD')!
    expect(usd.points.map((p) => [p.x, p.y])).toEqual([
      ['Gross volume', 455],
      ['Refunds', -30],
      ['Disputes', -140],
      ['Fees', -4.95],
      ['Net', 280.05],
    ])
    const sek = r.series.find((s) => s.currency === 'SEK')!
    expect(sek.points.at(-1)!.y).toBe(971) // 1500 - 500 - 0 - 29
  })

  it('weekday by hour matrix counts charges', async () => {
    const r = await run('volume_by_weekday_hour')
    expect(r.matrix!.cells.reduce((n, c) => n + c[2], 0)).toBe(12)
  })

  // ── Success, declines, refunds ──────────────────────────────────────────

  it('success and decline rate: 7 captured of 10 attempts, pending and cancelled excluded', async () => {
    const s = await run('success_rate')
    expect(s.value).toBe(70)
    expect(kpi(s, 'numerator')).toBe(7)
    expect(kpi(s, 'denominator')).toBe(10)
    expect((await run('decline_rate')).value).toBe(30)
    // SEK only: captured c6, c7 of attempts c6, c7, c12
    expect((await run('success_rate', { currency: 'SEK' })).value).toBeCloseTo(66.67, 2)
  })

  it('declines by reason and failed amount', async () => {
    expect(byLabel(await run('declines_by_reason'))).toMatchObject({
      card_declined: 2,
      insufficient_funds: 1,
    })
    const f = await run('failed_amount_at_risk')
    expect(total(f, 'USD')).toBe(55)
    expect(total(f, 'SEK')).toBe(250)
    expect((await run('failed_payment_trend')).value).toBe(3)
  })

  it('charge status by gateway matrix', async () => {
    const r = await run('charges_by_gateway_status')
    expect(r.matrix!.y.sort()).toEqual(['adyen', 'stripe'])
    expect(r.matrix!.cells.reduce((n, c) => n + c[2], 0)).toBe(12)
  })

  it('refunds: succeeded only, releases of uncaptured charges excluded', async () => {
    const t = await run('refund_total')
    expect(total(t, 'USD')).toBe(30)
    expect(total(t, 'SEK')).toBe(500)
    expect((await run('refund_count')).value).toBe(3)
    expect(byLabel(await run('refunds_by_reason'))).toMatchObject({
      requested_by_customer: 1,
      duplicate: 1,
      '(none)': 1,
    })
  })

  it('refund rates: count over all captured charges, amount per currency', async () => {
    const c = await run('refund_rate_count')
    expect(kpi(c, 'numerator')).toBe(3)
    expect(kpi(c, 'denominator')).toBe(7)
    expect(c.value).toBeCloseTo(42.86, 2)
    const a = await run('refund_rate_amount')
    expect(kpi(a, 'ratio', 'USD')).toBeCloseTo(6.59, 2) // 3000 / 45500
    expect(kpi(a, 'ratio', 'SEK')).toBeCloseTo(33.33, 2) // 50000 / 150000
    expect(a.value).toBeNull()
  })

  // ── Risk ────────────────────────────────────────────────────────────────

  it('dispute rate: warnings excluded, thresholds 0.9 / 1.0 above, labelled indicative', async () => {
    const r = await run('dispute_rate_count')
    expect(kpi(r, 'numerator')).toBe(4) // d1, d2, d3, d5
    expect(kpi(r, 'denominator')).toBe(7)
    expect(r.value).toBeCloseTo(57.14, 2)
    expect(r.metric.thresholds).toEqual({ warn: 0.9, crit: 1.0, direction: 'above' })
    expect(r.metric.description).toMatch(/indicative/i)
    const amount = await run('dispute_rate_amount')
    expect(kpi(amount, 'ratio', 'USD')).toBeCloseTo(30.77, 2) // 14000 / 45500
    expect(kpi(amount, 'ratio', 'SEK')).toBe(0) // SEK has charges but only a warning-stage dispute
  })

  it('disputes: amount, reason, status, network and win rate', async () => {
    const d = await run('disputed_total')
    expect(total(d, 'USD')).toBe(140)
    expect(total(d, 'SEK')).toBeUndefined()
    expect((await run('disputes_count')).value).toBe(4)
    expect(byLabel(await run('disputes_by_reason'))).toMatchObject({
      fraudulent: 2,
      product_not_received: 1,
      general: 1,
    })
    const status = byLabel(await run('disputes_by_status'))
    expect(status).toMatchObject({ needs_response: 2, won: 1, lost: 1, warning_needs_response: 1 })
    expect(byLabel(await run('disputes_by_network'))).toMatchObject({ visa: 3, mastercard: 1 })
    const win = await run('dispute_win_rate')
    expect(win.value).toBe(50) // 1 won of 2 decided
  })

  it('disputes needing a response: count, amount, overdue and evidence deadlines', async () => {
    expect((await run('disputes_needing_response')).value).toBe(3) // d1, d4, d5
    expect((await run('disputes_response_overdue')).value).toBe(1) // d5 only; d4 has no deadline
    const amt = await run('disputes_needing_response_amount')
    expect(total(amt, 'USD')).toBe(90)
    expect(total(amt, 'SEK')).toBe(200)
    const deadlines = await run('dispute_evidence_deadlines')
    const usd = deadlines.series.find((s) => s.currency === 'USD')!
    expect(usd.points.find((p) => p.x === 'Today or past')!.y).toBe(10) // d5, 8 days overdue
    expect(usd.points.find((p) => p.x === '1–7 days')!.y).toBe(80) // d1 due in 2 days
    const sek = deadlines.series.find((s) => s.currency === 'SEK')!
    expect(sek.points.find((p) => p.x === 'No date')!.y).toBe(200) // d4
  })

  it('fraud proxy: fraudulent disputes over captured charges, with a proxy note', async () => {
    const r = await run('fraud_flagged_share')
    expect(kpi(r, 'numerator')).toBe(2) // d1, d3 (d4 is a warning)
    expect(r.value).toBeCloseTo(28.57, 2)
    expect(r.metric.note).toMatch(/proxy/i)
  })

  it('customer concentration: shares and HHI within each currency; ids only', async () => {
    const r = await run('customer_concentration')
    // USD: u1 35000, u5 8000, u2 2500 of 45500
    expect(kpi(r, 'top1_share', 'USD')).toBeCloseTo(76.92, 2)
    expect(kpi(r, 'top5_share', 'USD')).toBe(100)
    expect(kpi(r, 'hhi', 'USD')).toBeCloseTo(6256.49, 0)
    expect(kpi(r, 'groups', 'USD')).toBe(3)
    // SEK: u4 alone
    expect(kpi(r, 'top1_share', 'SEK')).toBe(100)
    expect(kpi(r, 'hhi', 'SEK')).toBe(10000)
    const top = r.table!.rows.find((row) => row['currency'] === 'USD' && row['rank'] === 1)!
    expect(top['label']).toBe('u1')
    expect(top['value']).toBe(350)
    expect(r.metric.thresholds).toEqual({ warn: 20, crit: 40, direction: 'above' })
    expect(r.metric.note).toMatch(/1500/)
  })

  it('gateway concentration and currency exposure', async () => {
    const g = await run('gateway_concentration', { currency: 'USD' })
    expect(kpi(g, 'top1_share', 'USD')).toBeCloseTo(56.04, 2) // stripe 25500 of 45500
    expect(kpi(g, 'hhi', 'USD')).toBeCloseTo(5072.6, 0)
    const c = await run('currency_exposure')
    expect(byLabel(c)).toEqual({ USD: 5, SEK: 2 })
  })

  it('payout failures, speed and pending amount', async () => {
    expect((await run('payout_failures')).value).toBe(2) // p3, p5
    const amt = await run('payout_failed_amount')
    expect(total(amt, 'USD')).toBe(100)
    expect(total(amt, 'SEK')).toBe(200)
    expect(byLabel(await run('payout_failures_by_code'))).toMatchObject({
      account_closed: 1,
      '(none)': 1,
    })
    const delay = await run('payout_delay')
    expect(delay.value).toBeCloseTo(2.33, 2) // p1 2d, p2 0d, p4 5d
    expect(kpi(delay, 'p50')).toBe(2)
    expect(delay.coverage).toEqual({ eligible: 3, total: 5 })
    const pending = await run('payouts_pending_amount')
    expect(total(pending, 'SEK')).toBe(800)
    expect(total(pending, 'USD')).toBeUndefined()
  })

  it('settlement lag reads availableOn of charge balance transactions', async () => {
    const r = await run('settlement_lag')
    expect(r.value).toBe(3) // b1 2d, b2 2d, b3 5d
    expect(kpi(r, 'p50')).toBe(2)
    expect(r.coverage).toEqual({ eligible: 3, total: 4 }) // b6 has no availableOn
  })

  it('delinquent customers and balances owed', async () => {
    expect((await run('delinquent_customers')).value).toBe(2)
    const b = await run('customer_balances_owed')
    expect(total(b, 'USD')).toBe(50)
    expect(total(b, 'SEK')).toBe(300)
  })

  // ── Subscriptions ───────────────────────────────────────────────────────

  it('subscriptions: active now, by status, new and cancelled', async () => {
    expect((await run('active_subscriptions')).value).toBe(4) // s1 s2 s3 s7
    expect((await run('active_subscriptions', { currency: 'SEK' })).value).toBe(1)
    expect(byLabel(await run('subscriptions_by_status'))).toMatchObject({
      active: 3,
      past_due: 1,
      cancelled: 2,
      trialing: 1,
      expired: 1,
    })
    expect((await run('new_subscriptions_per_day')).value).toBe(4) // s1 s3 s5 s6
    expect((await run('cancellations_per_day')).value).toBe(2) // s4 s5
    expect((await run('past_due_subscriptions')).value).toBe(1)
    expect((await run('past_due_share')).value).toBe(25)
  })

  it('involuntary churn proxy and trial conversion', async () => {
    const i = await run('involuntary_churn')
    expect(i.value).toBe(50) // s4 was in dunning, s5 not
    expect(i.metric.note).toMatch(/proxy/i)
    expect((await run('trial_conversion_rate')).value).toBe(50) // s7 active, s8 expired
  })

  // ── Invoices ────────────────────────────────────────────────────────────

  it('open and overdue receivables, per currency', async () => {
    const open = await run('open_receivables')
    expect(total(open, 'USD')).toBe(1500)
    expect(total(open, 'SEK')).toBe(2000)
    const over = await run('overdue_receivables')
    expect(total(over, 'USD')).toBe(1500)
    expect(total(over, 'SEK')).toBeUndefined() // i3 is not due yet
    expect((await run('overdue_invoices')).value).toBe(2)
  })

  it('receivables aging buckets by days past due (now injected)', async () => {
    const r = await run('receivables_aging')
    const usd = Object.fromEntries(
      r.series.find((s) => s.currency === 'USD')!.points.map((p) => [p.x, p.y]),
    )
    expect(usd).toMatchObject({
      Current: 0,
      '1–30 days': 1000,
      '31–60 days': 500,
      '61–90 days': 0,
      '91+ days': 0,
    })
    const sek = Object.fromEntries(
      r.series.find((s) => s.currency === 'SEK')!.points.map((p) => [p.x, p.y]),
    )
    expect(sek['Current']).toBe(2000)
    const n = await run('receivables_aging_count')
    expect(n.value).toBe(3)
  })

  it('DSO per currency: open balance over the last 90 days of invoicing', async () => {
    const r = await run('dso')
    // USD: 150000 open / 197000 issued (i1 i2 i4 i5 i8; draft and void excluded) × 90
    expect(kpi(r, 'dso', 'USD')).toBe(68.5)
    expect(kpi(r, 'dso', 'SEK')).toBe(90)
    expect(r.value).toBeNull()
  })

  it('days to pay and days beyond terms', async () => {
    const p = await run('days_to_pay')
    expect(p.value).toBe(10) // i4 10d, i5 10d
    const t = await run('days_beyond_terms')
    expect(t.value).toBe(4) // i4 0d, i5 8d
  })

  it('invoiced amount, statuses, uncollectible, collection rate, tax share', async () => {
    const inv = await run('invoiced_amount')
    expect(sum(inv, 'USD')).toBe(1470) // i1 i4 i5 i8, i2 is February
    expect(sum(inv, 'SEK')).toBe(2000)
    expect(byLabel(await run('invoices_by_status'))).toMatchObject({
      open: 2,
      paid: 2,
      draft: 1,
      void: 1,
      uncollectible: 1,
    })
    expect(sum(await run('uncollectible_amount'), 'USD')).toBe(70)
    const c = await run('invoice_collection_rate')
    expect(kpi(c, 'ratio', 'USD')).toBeCloseTo(28.57, 2) // 40000 / 140000 due in March
    const tax = await run('tax_share')
    expect(kpi(tax, 'ratio', 'USD')).toBeCloseTo(17.01, 2) // 25000 / 147000
  })

  // ── Fees and payouts ────────────────────────────────────────────────────

  it('fees and effective fee rate per currency', async () => {
    const f = await run('fees_period_total')
    expect(total(f, 'USD')).toBe(19.95) // 320 + 175 + 1500 (dispute fee)
    expect(total(f, 'SEK')).toBe(29)
    const rate = await run('effective_fee_rate')
    expect(kpi(rate, 'ratio', 'USD')).toBeCloseTo(1.41, 2) // 495 / 35000
    expect(kpi(rate, 'ratio', 'SEK')).toBe(2.9)
    expect(rate.coverage).toEqual({ eligible: 3, total: 4 })
    const per = await run('fee_per_transaction', { currency: 'USD' })
    expect(total(per, 'USD')).toBeCloseTo(2.48, 1) // 247.5 minor
    const net = await run('net_via_balance_txn')
    expect(sum(net, 'USD')).toBeCloseTo(9680 / 100 + 4825 / 100 - 95, 2)
  })

  it('payouts: paid per day by arrival date, by status, instant share, balance flow', async () => {
    const p = await run('payout_amount_per_day')
    expect(sum(p, 'USD')).toBe(800)
    expect(point(p, '2026-03-07', 'USD')).toBe(500)
    expect(byLabel(await run('payouts_by_status'))).toMatchObject({
      paid: 2,
      failed: 1,
      in_transit: 1,
      cancelled: 1,
    })
    expect((await run('instant_payout_share')).value).toBe(20)
    const flow = await run('balance_flow_by_type')
    const usd = flow.series.find((s) => s.currency === 'USD')!
    expect(usd.points.find((x) => x.x === 'Charges')!.y).toBe(350) // b1 b2 b6
    expect(usd.points.find((x) => x.x === 'Disputes')!.y).toBe(-80)
  })

  // ── Catalog shape ───────────────────────────────────────────────────────

  it('every payments metric runs, is sectioned, and money results never mix currencies', async () => {
    const defs = RESOURCE_METRICS.filter((d) => d.vertical === 'payments')
    expect(defs.length).toBeGreaterThanOrEqual(60)
    for (const d of defs) {
      expect(d.section, d.id).toBeTruthy()
      const r = await engine.run(d.id, ALL, MARCH)
      expect(r.masked, d.id).toBe(false)
      for (const s of r.series) {
        if (r.metric.money && d.kind !== 'histogram')
          expect(s.currency, `${d.id}/${s.name}`).not.toBeUndefined()
      }
    }
  })

  it('financial masking withholds money metrics and keeps counts', async () => {
    const masked = { tenants: '*' as const, maskFinancial: true }
    expect((await engine.run('payments.gross_volume', masked, MARCH)).masked).toBe(true)
    expect((await engine.run('payments.charge_count', masked, MARCH)).masked).toBe(false)
    expect((await engine.run('payments.success_rate', masked, MARCH)).value).toBe(70)
  })
})
