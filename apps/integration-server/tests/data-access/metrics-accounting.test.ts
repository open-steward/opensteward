/**
 * The accounting metric catalog against hand-computed values. Two currencies
 * (SEK on connection A, EUR on connection B), and a set of documents each
 * ISSUED_AR / OPEN_AR / OVERDUE rule must exclude: a BILL and a CREDITMEMO
 * stored in `invoices`, a DRAFT, a VOIDED.
 *
 * "Now" is Wednesday 2026-03-18 12:00 UTC. The range is 2026-03-01..03-18
 * unless a test says otherwise. Runs on SQLite always and on Postgres when
 * TEST_DATABASE_URL is set (the schema is dropped per test).
 *
 * Seed cheat-sheet (amounts in minor units; ISSUED_AR posted in March):
 *   SEK invoices  s1 100000 bal 100000 due 03-10 (8d late)   c1
 *                 s2  50000 bal  30000 due 01-01 (76d late)  c2  posted Feb
 *                 s3  40000 bal  40000 due 03-18 (today)     c1  no `type`
 *                 s4  30000 paid 30000 due 03-12 paid 03-12  c3  on time, 10d
 *                 s5  10000 paid 10000 due 03-05 paid 03-13  c1  late, 10d
 *                 s10 20000 bal  20000 due 03-17 (1d late)   c2
 *   excluded      s6 DRAFT, s7 VOIDED, s8 BILL, s9 CREDITMEMO (all huge)
 *   EUR invoices  e1  20000 bal  20000 due 04-15             c9
 *                 e2  10000 paid 10000 due 03-20 paid 03-08  c9  3d
 *                 e3  60000 bal  60000 due 02-04 (42d late)  c8  posted Jan
 *                 e4  10000 bal  10000 no due date           c9  no `type`
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
import { ACCOUNTING_METRICS } from '../../src/data-access/metrics/catalog/accounting'
import type { MetricKpi, MetricResult } from '../../src/data-access/metrics/types'

const SECRET = 'b'.repeat(40)
const NOW = new Date('2026-03-18T12:00:00Z')
const MARCH = { from: '2026-03-01', to: '2026-03-18' }
const FEB_MARCH = { from: '2026-02-01', to: '2026-03-18' }
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

const INVOICES_SEK: Row[] = [
  {
    id: 's1',
    type: 'INVOICE',
    status: 'AUTHORIZED',
    currency: 'SEK',
    totalAmount: 100000,
    taxAmount: 20000,
    balanceAmount: 100000,
    postedAt: '2026-03-01',
    dueAt: '2026-03-10',
    contactId: 'c1',
  },
  {
    id: 's2',
    type: 'INVOICE',
    status: 'PARTIALLY_PAID',
    currency: 'SEK',
    totalAmount: 50000,
    paidAmount: 20000,
    balanceAmount: 30000,
    postedAt: '2026-02-01',
    dueAt: '2026-01-01',
    contactId: 'c2',
  },
  {
    id: 's3',
    status: 'AUTHORIZED',
    currency: 'SEK',
    totalAmount: 40000,
    taxAmount: 8000,
    balanceAmount: 40000,
    postedAt: '2026-03-10',
    dueAt: '2026-03-18',
    contactId: 'c1',
  },
  {
    id: 's4',
    type: 'INVOICE',
    status: 'PAID',
    currency: 'SEK',
    totalAmount: 30000,
    taxAmount: 6000,
    paidAmount: 30000,
    balanceAmount: 0,
    refundAmount: 3000,
    postedAt: '2026-03-02',
    dueAt: '2026-03-12',
    paidAt: '2026-03-12T00:00:00Z',
    contactId: 'c3',
  },
  {
    id: 's5',
    type: 'INVOICE',
    status: 'PAID',
    currency: 'SEK',
    totalAmount: 10000,
    paidAmount: 10000,
    balanceAmount: 0,
    postedAt: '2026-03-03',
    dueAt: '2026-03-05',
    paidAt: '2026-03-13T00:00:00Z',
    contactId: 'c1',
  },
  {
    id: 's10',
    type: 'INVOICE',
    status: 'AUTHORIZED',
    currency: 'SEK',
    totalAmount: 20000,
    balanceAmount: 20000,
    postedAt: '2026-03-12',
    dueAt: '2026-03-17',
    contactId: 'c2',
  },
  {
    id: 's6',
    type: 'INVOICE',
    status: 'DRAFT',
    currency: 'SEK',
    totalAmount: 999999,
    balanceAmount: 999999,
    postedAt: '2026-03-04',
    dueAt: '2026-03-01',
    contactId: 'c4',
  },
  {
    id: 's7',
    type: 'INVOICE',
    status: 'VOIDED',
    currency: 'SEK',
    totalAmount: 888888,
    balanceAmount: 888888,
    postedAt: '2026-03-05',
    dueAt: '2026-03-01',
    contactId: 'c4',
  },
  {
    id: 's8',
    type: 'BILL',
    status: 'AUTHORIZED',
    currency: 'SEK',
    totalAmount: 777777,
    balanceAmount: 777777,
    postedAt: '2026-03-06',
    dueAt: '2026-03-01',
    contactId: 'v9',
  },
  {
    id: 's9',
    type: 'CREDITMEMO',
    status: 'AUTHORIZED',
    currency: 'SEK',
    totalAmount: 666666,
    balanceAmount: 666666,
    postedAt: '2026-03-07',
    dueAt: '2026-03-01',
    contactId: 'c4',
  },
]
const INVOICES_EUR: Row[] = [
  {
    id: 'e1',
    type: 'INVOICE',
    status: 'AUTHORIZED',
    currency: 'EUR',
    totalAmount: 20000,
    taxAmount: 4000,
    balanceAmount: 20000,
    postedAt: '2026-03-15',
    dueAt: '2026-04-15',
    contactId: 'c9',
  },
  {
    id: 'e2',
    type: 'INVOICE',
    status: 'PAID',
    currency: 'EUR',
    totalAmount: 10000,
    taxAmount: 2000,
    paidAmount: 10000,
    balanceAmount: 0,
    postedAt: '2026-03-05',
    dueAt: '2026-03-20',
    paidAt: '2026-03-08T00:00:00Z',
    contactId: 'c9',
  },
  {
    id: 'e3',
    type: 'INVOICE',
    status: 'AUTHORIZED',
    currency: 'EUR',
    totalAmount: 60000,
    balanceAmount: 60000,
    postedAt: '2026-01-05',
    dueAt: '2026-02-04',
    contactId: 'c8',
  },
  {
    id: 'e4',
    status: 'AUTHORIZED',
    currency: 'EUR',
    totalAmount: 10000,
    balanceAmount: 10000,
    postedAt: '2026-03-16',
    contactId: 'c9',
  },
]
const BILLS_SEK: Row[] = [
  {
    id: 'b1',
    status: 'AUTHORIZED',
    currency: 'SEK',
    totalAmount: 80000,
    taxAmount: 16000,
    balanceAmount: 80000,
    postedAt: '2026-03-02',
    dueAt: '2026-03-22',
    contactId: 'v1',
  },
  {
    id: 'b2',
    status: 'PAID',
    currency: 'SEK',
    totalAmount: 60000,
    taxAmount: 12000,
    paidAmount: 60000,
    balanceAmount: 0,
    postedAt: '2026-02-10',
    dueAt: '2026-03-12',
    paidAt: '2026-03-05T00:00:00Z',
    contactId: 'v2',
  },
  {
    id: 'b3',
    status: 'AUTHORIZED',
    currency: 'SEK',
    totalAmount: 30000,
    balanceAmount: 30000,
    postedAt: '2026-02-20',
    dueAt: '2026-03-08',
    contactId: 'v1',
  },
  {
    id: 'b4',
    status: 'DRAFT',
    currency: 'SEK',
    totalAmount: 500000,
    balanceAmount: 500000,
    postedAt: '2026-03-03',
    dueAt: '2026-03-30',
    contactId: 'v1',
  },
]
const BILLS_EUR: Row[] = [
  {
    id: 'b5',
    status: 'AUTHORIZED',
    currency: 'EUR',
    totalAmount: 25000,
    taxAmount: 5000,
    balanceAmount: 25000,
    postedAt: '2026-03-10',
    dueAt: '2026-04-10',
    contactId: 'v3',
  },
]
const CREDITMEMOS: Row[] = [
  {
    id: 'cm1',
    status: 'AUTHORIZED',
    currency: 'SEK',
    totalAmount: 8000,
    postedAt: '2026-03-06',
    contactId: 'c1',
  },
  {
    id: 'cm2',
    status: 'AUTHORIZED',
    currency: 'EUR',
    totalAmount: 3000,
    postedAt: '2026-03-07',
    contactId: 'c9',
  },
  {
    id: 'cm3',
    status: 'DRAFT',
    currency: 'SEK',
    totalAmount: 99999,
    postedAt: '2026-03-08',
    contactId: 'c1',
  },
]
const EXPENSES: Row[] = [
  { id: 'x1', currency: 'SEK', totalAmount: 12000, accountId: 'a1', postedAt: '2026-03-09' },
  { id: 'x2', currency: 'SEK', totalAmount: 8000, accountId: 'a2', postedAt: '2026-03-10' },
  { id: 'x3', currency: 'EUR', totalAmount: 5000, accountId: 'a1', postedAt: '2026-03-11' },
]

describe.each(BACKENDS)('accounting metrics ($name)', (backend) => {
  let handle: DbHandle
  let engine: MetricsEngine
  let engineAt: (now: string) => MetricsEngine

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    const creds = await CredentialStore.create(handle, SECRET)
    const resources = await ResourceStore.create(handle)
    const sync = await SyncStore.create(handle)
    const conn = { accessToken: 'x' } as never
    const a = await creds.create('xero', null, conn, 'Books SEK', 'accounting', 'tenant-a')
    const b = await creds.create('quickbooks', null, conn, 'Books EUR', 'accounting', 'tenant-a')
    await resources.upsertMany('accounting', 'xero', a, 'invoices', INVOICES_SEK)
    await resources.upsertMany('accounting', 'xero', a, 'bills', BILLS_SEK)
    await resources.upsertMany(
      'accounting',
      'xero',
      a,
      'creditmemos',
      CREDITMEMOS.filter((c) => c.currency === 'SEK'),
    )
    await resources.upsertMany(
      'accounting',
      'xero',
      a,
      'expenses',
      EXPENSES.filter((c) => c.currency === 'SEK'),
    )
    await resources.upsertMany('accounting', 'quickbooks', b, 'invoices', INVOICES_EUR)
    await resources.upsertMany('accounting', 'quickbooks', b, 'bills', BILLS_EUR)
    await resources.upsertMany(
      'accounting',
      'quickbooks',
      b,
      'creditmemos',
      CREDITMEMOS.filter((c) => c.currency === 'EUR'),
    )
    await resources.upsertMany(
      'accounting',
      'quickbooks',
      b,
      'expenses',
      EXPENSES.filter((c) => c.currency === 'EUR'),
    )
    engineAt = (now) =>
      createMetricsEngine({
        credentialStore: creds,
        resourceStore: resources,
        syncStore: sync,
        now: () => new Date(now),
        resourceMetrics: RESOURCE_METRICS,
      })
    engine = engineAt(NOW.toISOString())
  })

  afterEach(async () => {
    await handle.close()
  })

  const run = (id: string, params: Record<string, unknown> = MARCH): Promise<MetricResult> =>
    engine.run(`accounting.${id}`, ALL, params as never)
  /** Major-unit total for a currency. */
  const total = (r: MetricResult, c: string) => r.totals?.find((t) => t.currency === c)?.amount
  const kpi = (r: MetricResult, key: string, c?: string) =>
    r.kpis?.find((k: MetricKpi) => k.key === key && (c === undefined || k.currency === c))?.value
  const point = (r: MetricResult, c: string | null, x: string) =>
    r.series.find((s) => s.currency === c)?.points.find((p) => p.x === x)?.y
  const points = (r: MetricResult, c: string) =>
    r.series.find((s) => s.currency === c)?.points.map((p) => p.y)
  const tableRow = (r: MetricResult, where: Record<string, unknown>) =>
    r.table?.rows.find((row) => Object.entries(where).every(([k, v]) => row[k] === v))

  it('serves every accounting metric without error, and no money crosses currencies', async () => {
    for (const def of ACCOUNTING_METRICS) {
      const r = await engine.run(def.id, ALL, MARCH as never)
      expect(r.masked, def.id).toBe(false)
      for (const s of r.series) {
        if (r.metric.money) expect(s.currency !== undefined, `${def.id} series`).toBe(true)
      }
      if (r.metric.money) {
        // one total per currency, never one merged figure
        expect(r.value, def.id).toBeNull()
      }
    }
  })

  // ── Sets: ISSUED_AR, OPEN_AR, OVERDUE ───────────────────────────────────
  describe('document sets', () => {
    it('revenue is ISSUED_AR only: no bill, credit note, draft or void', async () => {
      const r = await run('revenue')
      // SEK s1+s3+s4+s5+s10 = 200000; EUR e1+e2+e4 = 40000
      expect(total(r, 'SEK')).toBe(2000)
      expect(total(r, 'EUR')).toBe(400)
      expect(r.totals).toHaveLength(2)
      expect(r.currencies).toEqual(['EUR', 'SEK'])
    })

    it('the currency filter keeps one currency and still lists both', async () => {
      const r = await run('revenue', { ...MARCH, currency: 'EUR' })
      expect(r.totals?.map((t) => t.currency)).toEqual(['EUR'])
      expect(total(r, 'EUR')).toBe(400)
      expect(r.currencies).toEqual(['EUR', 'SEK'])
      const count = await run('invoice_count', { ...MARCH, currency: 'SEK' })
      expect(count.value).toBe(5)
    })

    it('counts and averages', async () => {
      expect((await run('invoice_count')).value).toBe(8) // 5 SEK + 3 EUR (counts may add)
      const avg = await run('avg_invoice_value')
      expect(total(avg, 'SEK')).toBe(400) // 200000 / 5
      expect(total(avg, 'EUR')).toBeCloseTo(133.33, 2) // 40000 / 3
    })

    it('invoices_by_status is ISSUED_AR: draft and voided are gone', async () => {
      const r = await run('invoices_by_status')
      const by = Object.fromEntries((r.table?.rows ?? []).map((x) => [x.label, x.value]))
      expect(by).toEqual({ AUTHORIZED: 5, PAID: 3 })
    })

    it('document_mix separates types and shows a missing type as (none)', async () => {
      const r = await run('document_mix')
      // not draft/void, posted in March: 6 INVOICE, s8 BILL, s9 CREDITMEMO, s3 + e4 without a type
      expect(tableRow(r, { label: 'Invoice' })?.value).toBe(6)
      expect(tableRow(r, { label: 'Bill' })?.value).toBe(1)
      expect(tableRow(r, { label: 'Credit note' })?.value).toBe(1)
      expect(tableRow(r, { label: '(none)' })?.value).toBe(2)
    })

    it('ar_balance is OPEN_AR per currency; outstanding_amount agrees', async () => {
      const r = await run('ar_balance')
      // SEK s1+s2+s3+s10 = 190000; EUR e1+e3+e4 = 90000
      expect(total(r, 'SEK')).toBe(1900)
      expect(total(r, 'EUR')).toBe(900)
      const old = await run('outstanding_amount')
      expect(total(old, 'SEK')).toBe(1900)
      expect(total(old, 'EUR')).toBe(900)
      expect((await run('open_invoice_count')).value).toBe(7)
    })

    it('overdue comes from dueAt, not status, and today is not overdue', async () => {
      const r = await run('overdue_amount')
      // SEK s1 100000 + s2 30000 + s10 20000 (s3 is due today); EUR e3 60000 (e4 has no due date)
      expect(total(r, 'SEK')).toBe(1500)
      expect(total(r, 'EUR')).toBe(600)
    })

    it('overdue_pct is per currency', async () => {
      const r = await run('overdue_pct')
      expect(kpi(r, 'ratio', 'SEK')).toBe(78.95) // 150000 / 190000
      expect(kpi(r, 'ratio', 'EUR')).toBe(66.67) // 60000 / 90000
      expect(kpi(r, 'numerator', 'SEK')).toBe(1500)
      expect(kpi(r, 'denominator', 'EUR')).toBe(900)
      expect(r.value).toBeNull()
    })
  })

  // ── Aging ────────────────────────────────────────────────────────────────
  describe('aging', () => {
    const LABELS = ['Current', '1–30 days', '31–60 days', '61–90 days', '91+ days']

    it('ar_aging buckets on dueAt with the edges at 0, 30, 60 and 90 days', async () => {
      const r = await run('ar_aging')
      expect(r.series.find((s) => s.currency === 'SEK')?.points.map((p) => p.x)).toEqual(LABELS)
      // SEK: s3 today → current; s1 8d + s10 1d; s2 76d
      expect(points(r, 'SEK')).toEqual([400, 1200, 0, 300, 0])
      // EUR: e1 future → current; e3 42d; e4 has no due date
      expect(points(r, 'EUR')).toEqual([200, 0, 600, 0, 0, 100])
    })

    it('a bucket edge belongs to the lower bucket (30 days late is 1–30, 31 is 31–60)', async () => {
      const sekCounts = async (now: string) =>
        (
          await engineAt(now).run('accounting.ar_aging_count', ALL, { currency: 'SEK' })
        ).series[0]!.points.map((p) => p.y)
      // open SEK: s1 due 03-10, s10 03-17, s3 03-18, s2 01-01
      expect(await sekCounts('2026-04-09T12:00:00Z')).toEqual([0, 3, 0, 0, 1]) // s1 exactly 30d late
      expect(await sekCounts('2026-04-10T12:00:00Z')).toEqual([0, 2, 1, 0, 1]) // s1 31d
      expect(await sekCounts('2026-03-02T12:00:00Z')).toEqual([3, 0, 1, 0, 0]) // s2 exactly 60d
      expect(await sekCounts('2026-03-03T12:00:00Z')).toEqual([3, 0, 0, 1, 0]) // s2 61d
      expect(await sekCounts('2026-04-01T12:00:00Z')).toEqual([0, 3, 0, 1, 0]) // s2 exactly 90d
    })

    it('ar_aging_count counts the same open invoices', async () => {
      const r = await run('ar_aging_count', { ...MARCH, currency: 'SEK' })
      expect(r.series[0]!.points.map((p) => p.y)).toEqual([1, 2, 0, 1, 0])
      expect(r.value).toBe(4)
    })

    it('ap_aging and the due schedule look at bills, current side and future side', async () => {
      const past = await run('ap_aging')
      // SEK: b1 due in the future → current; b3 10d late. EUR: b5 future → current
      expect(points(past, 'SEK')).toEqual([800, 300, 0, 0, 0])
      expect(points(past, 'EUR')).toEqual([250, 0, 0, 0, 0])
      const fut = await run('bills_due_schedule')
      // buckets: today or past, 1–7, 8–14, 15–30, 31+ days ahead
      expect(points(fut, 'SEK')?.[1]).toBe(800) // b1, 4 days away
      expect(points(fut, 'EUR')).toEqual([0, 0, 0, 250, 0])
    })
  })

  // ── DSO / DPO ─────────────────────────────────────────────────────────────
  describe('days outstanding', () => {
    it('DSO = open AR ÷ invoiced in the last 90 days × 90, per currency', async () => {
      const r = await run('dso')
      // SEK: 190000 / (s1 100000 + s2 50000 + s3 40000 + s4 30000 + s5 10000 + s10 20000 = 250000) × 90
      expect(kpi(r, 'dso', 'SEK')).toBe(68.4)
      // EUR: 90000 / (e1 20000 + e2 10000 + e3 60000 + e4 10000 = 100000) × 90
      expect(kpi(r, 'dso', 'EUR')).toBe(81)
      expect(kpi(r, 'sales', 'SEK')).toBe(2500)
      expect(r.value).toBeNull()
      expect(r.range).toEqual({ from: '2025-12-19', to: '2026-03-18' })
    })

    it('DPO = open AP ÷ billed in the last 90 days × 90; drafts are out', async () => {
      const r = await run('dpo')
      // SEK: (80000 + 30000) / (80000 + 60000 + 30000) × 90 = 58.235…
      expect(kpi(r, 'dpo', 'SEK')).toBe(58.2)
      // EUR: 25000 / 25000 × 90
      expect(kpi(r, 'dpo', 'EUR')).toBe(90)
    })

    it('the currency filter narrows DSO', async () => {
      const r = await run('dso', { currency: 'EUR' })
      expect(r.kpis?.every((k) => k.currency === 'EUR')).toBe(true)
      expect(r.value).toBe(81)
    })
  })

  // ── Paying behaviour ──────────────────────────────────────────────────────
  describe('payment behaviour', () => {
    it('days to pay, beyond terms and the distribution', async () => {
      const pay = await run('avg_days_to_pay')
      expect(pay.value).toBe(7.67) // s4 10, s5 10, e2 3
      const sek = await run('avg_days_to_pay', { ...MARCH, currency: 'SEK' })
      expect(sek.value).toBe(10)
      const beyond = await run('avg_days_beyond_terms')
      expect(beyond.value).toBe(-1.33) // s4 0, s5 +8, e2 −12
      expect((await run('avg_days_beyond_terms', { ...MARCH, currency: 'SEK' })).value).toBe(4)
      const dist = await run('days_to_pay_distribution')
      expect(dist.value).toBe(10) // median of 3, 10, 10
      // bands < 7, 7–14, …
      expect(dist.series[0]!.points.slice(0, 2).map((p) => p.y)).toEqual([1, 2])
    })

    it('on-time rate and late-payment trend are complements per currency', async () => {
      const on = await run('on_time_payment_rate')
      expect(on.value).toBe(66.67)
      expect((await run('on_time_payment_rate', { ...MARCH, currency: 'SEK' })).value).toBe(50)
      expect((await run('on_time_payment_rate', { ...MARCH, currency: 'EUR' })).value).toBe(100)
      const late = await run('late_payment_trend')
      expect(late.value).toBe(33.33)
      expect((await run('late_payment_trend', { ...MARCH, currency: 'SEK' })).value).toBe(50)
      expect((await run('late_payment_trend', { ...MARCH, currency: 'EUR' })).value).toBe(0)
      expect(late.coverage).toBeDefined()
    })

    it('supplier payment time', async () => {
      const r = await run('avg_days_to_pay_suppliers')
      expect(r.value).toBe(23) // b2: 02-10 → 03-05
    })
  })

  // ── Lists ────────────────────────────────────────────────────────────────
  describe('rankings', () => {
    it('top_open_invoices ranks balances per currency, by id', async () => {
      const r = await run('top_open_invoices')
      const sek = (r.table?.rows ?? []).filter((x) => x.currency === 'SEK')
      expect(sek.map((x) => x.label)).toEqual(['s1', 's3', 's2', 's10'])
      expect(sek.map((x) => x.value)).toEqual([1000, 400, 300, 200])
      const eur = (r.table?.rows ?? []).filter((x) => x.currency === 'EUR')
      expect(eur.map((x) => x.label)).toEqual(['e3', 'e1', 'e4'])
    })

    it('top suppliers and expenses by account', async () => {
      const r = await run('top_expense_suppliers', FEB_MARCH)
      const sek = (r.table?.rows ?? []).filter((x) => x.currency === 'SEK')
      expect(sek.map((x) => [x.label, x.value])).toEqual([
        ['v1', 1100],
        ['v2', 600],
      ])
      const ex = await run('expenses_by_account')
      const rows = (ex.table?.rows ?? []).filter((x) => x.currency === 'SEK')
      expect(rows.map((x) => [x.label, x.value])).toEqual([
        ['a1', 120],
        ['a2', 80],
      ])
    })

    it('bills_by_status counts bills dated in the period', async () => {
      const r = await run('bills_by_status')
      const by = Object.fromEntries((r.table?.rows ?? []).map((x) => [x.label, x.value]))
      expect(by).toEqual({ AUTHORIZED: 2, DRAFT: 1 })
    })
  })

  // ── Payables ─────────────────────────────────────────────────────────────
  it('payables snapshots', async () => {
    expect(total(await run('ap_balance'), 'SEK')).toBe(1100)
    expect(total(await run('ap_balance'), 'EUR')).toBe(250)
    expect(total(await run('ap_overdue_amount'), 'SEK')).toBe(300)
    expect(
      (await run('ap_overdue_amount')).totals?.find((t) => t.currency === 'EUR'),
    ).toBeUndefined()
    const w7 = await run('bills_due_next_7d')
    expect(total(w7, 'SEK')).toBe(800) // b1 due 03-22
    expect(total(w7, 'EUR')).toBeUndefined() // b5 due 04-10
    const w30 = await run('bills_due_next_30d')
    expect(total(w30, 'SEK')).toBe(800)
    expect(total(w30, 'EUR')).toBe(250)
  })

  // ── Overview money flows ──────────────────────────────────────────────────
  describe('flows', () => {
    it('revenue_per_month is one series per currency', async () => {
      const r = await run('revenue_per_month', { ...MARCH, granularity: 'month' })
      expect(points(r, 'SEK')).toEqual([2000])
      expect(points(r, 'EUR')).toEqual([400])
    })

    it('invoiced_vs_collected nets per currency', async () => {
      const r = await run('invoiced_vs_collected')
      // SEK: 200000 invoiced, collected s4 30000 + s5 10000
      expect(point(r, 'SEK', 'Invoiced')).toBe(2000)
      expect(point(r, 'SEK', 'Collected')).toBe(-400)
      expect(total(r, 'SEK')).toBe(1600)
      expect(total(r, 'EUR')).toBe(300) // 40000 − e2 10000
    })

    it('expenses add bills and employee expenses within one currency', async () => {
      const r = await run('expenses')
      expect(point(r, 'SEK', 'Bills')).toBe(800) // b1 (b4 is a draft)
      expect(point(r, 'SEK', 'Expenses')).toBe(200)
      expect(total(r, 'SEK')).toBe(1000)
      expect(total(r, 'EUR')).toBe(300)
    })

    it('cash in, cash out and net cash flow', async () => {
      const inn = await run('cash_in_per_month', { ...MARCH, granularity: 'month' })
      expect(points(inn, 'SEK')).toEqual([400])
      expect(points(inn, 'EUR')).toEqual([100])
      const out = await run('cash_out_per_month', { ...MARCH, granularity: 'month' })
      expect(points(out, 'SEK')).toEqual([600])
      expect(out.series.find((s) => s.currency === 'EUR')).toBeUndefined() // no EUR bill was paid
      const net = await run('net_cash_flow')
      expect(total(net, 'SEK')).toBe(-200) // 400 in, 600 out
      expect(total(net, 'EUR')).toBe(100)
    })
  })

  // ── Tax ──────────────────────────────────────────────────────────────────
  describe('tax', () => {
    it('collected, paid, net and field coverage', async () => {
      expect(total(await run('tax_collected'), 'SEK')).toBe(340) // s1 + s3 + s4
      expect(total(await run('tax_collected'), 'EUR')).toBe(60)
      expect(total(await run('tax_paid'), 'SEK')).toBe(160) // b1 only in March
      const net = await run('net_tax_position')
      expect(total(net, 'SEK')).toBe(180)
      expect(total(net, 'EUR')).toBe(10)
      const cov = await run('tax_field_coverage')
      expect(cov.value).toBe(62.5) // 5 of 8 invoices carry tax
      expect((await run('tax_field_coverage', { ...MARCH, currency: 'SEK' })).value).toBe(60)
      expect((await run('tax_field_coverage', { ...MARCH, currency: 'EUR' })).value).toBe(66.67)
    })
  })

  // ── Risk ─────────────────────────────────────────────────────────────────
  describe('risk', () => {
    it('customer concentration: shares and HHI per currency', async () => {
      const r = await run('customer_concentration')
      // SEK total 200000: c1 150000 (75%), c3 30000 (15%), c2 20000 (10%)
      expect(kpi(r, 'top5_share', 'SEK')).toBe(100)
      expect(kpi(r, 'hhi', 'SEK')).toBe(5950) // 75² + 15² + 10² = 5625 + 225 + 100
      expect(kpi(r, 'groups', 'SEK')).toBe(3)
      // EUR total 40000, all c9
      expect(kpi(r, 'hhi', 'EUR')).toBe(10000)
      expect(kpi(r, 'top5_share', 'EUR')).toBe(100)
      expect(r.value).toBeNull() // two currencies: no single headline
      const sek = await run('customer_concentration', { ...MARCH, currency: 'SEK' })
      expect(sek.value).toBe(75)
      expect(sek.thresholds).toEqual({ warn: 20, crit: 40, direction: 'above' })
    })

    it('supplier concentration over Feb–Mar', async () => {
      const r = await run('supplier_concentration', { ...FEB_MARCH, currency: 'SEK' })
      // total 170000: v1 110000 (64.71%), v2 60000 (35.29%) → HHI (110² + 60²) / 170² × 10000 = 5433
      expect(r.value).toBe(64.71)
      expect(kpi(r, 'hhi')).toBe(5433)
      const eur = await run('supplier_concentration', { ...FEB_MARCH, currency: 'EUR' })
      expect(eur.value).toBe(100)
    })

    it('overdue exposure by customer is the overdue balance grouped by contact id', async () => {
      const r = await run('overdue_exposure_by_customer')
      const sek = (r.table?.rows ?? []).filter((x) => x.currency === 'SEK')
      expect(sek.map((x) => [x.label, x.value])).toEqual([
        ['c1', 1000],
        ['c2', 500],
      ])
      const eur = (r.table?.rows ?? []).filter((x) => x.currency === 'EUR')
      expect(eur.map((x) => [x.label, x.value])).toEqual([['c8', 600]])
    })

    it('credit note ratio divides within one currency and skips drafts', async () => {
      const r = await run('credit_note_ratio')
      expect(kpi(r, 'ratio', 'SEK')).toBe(4) // 8000 / 200000
      expect(kpi(r, 'ratio', 'EUR')).toBe(7.5) // 3000 / 40000
    })

    it('voided invoices and refunds', async () => {
      expect((await run('voided_invoices')).value).toBe(1)
      expect((await run('voided_invoices', { ...MARCH, currency: 'EUR' })).value).toBe(0)
      // s7 voided of 9 non-draft invoices (s1 s3 s4 s5 s10 s7 e1 e2 e4)
      expect((await run('voided_invoice_rate')).value).toBe(11.11)
      const refund = await run('refund_rate')
      expect(kpi(refund, 'ratio', 'SEK')).toBe(1.5) // 3000 / 200000
    })

    it('currency exposure counts invoices and never adds amounts', async () => {
      const r = await run('currency_exposure')
      expect(tableRow(r, { label: 'SEK' })?.value).toBe(5)
      expect(tableRow(r, { label: 'EUR' })?.value).toBe(3)
      expect(r.metric.money).toBe(false)
    })

    it('data-quality rates', async () => {
      const m = await run('missing_due_date_rate')
      expect(m.value).toBe(12.5) // e4 of 8
      expect((await run('missing_due_date_rate', { ...MARCH, currency: 'EUR' })).value).toBe(33.33)
      expect((await run('missing_due_date_rate', { ...MARCH, currency: 'SEK' })).value).toBe(0)
      const c = await run('data_coverage')
      expect(c.value).toBe(87.5) // 7 of 8 carry customer, due date and currency
    })
  })

  it('never renames a v1 id, and states a note on every proxy', () => {
    const ids = new Set(ACCOUNTING_METRICS.map((m) => m.id))
    for (const id of [
      'accounting.invoices_issued_per_day',
      'accounting.outstanding_amount',
      'accounting.invoices_by_status',
      'accounting.ar_aging',
      'accounting.dso',
      'accounting.dpo',
      'accounting.on_time_payment_rate',
      'accounting.avg_days_to_pay',
      'accounting.customer_concentration',
    ]) {
      expect(ids.has(id), id).toBe(true)
    }
    for (const m of ACCOUNTING_METRICS) {
      if (m.description.toLowerCase().includes('proxy')) expect(m.note, m.id).toBeTruthy()
    }
  })
})
