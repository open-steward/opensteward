/**
 * SumUp reads, against fakes of the endpoints in SumUp's first-party OpenAPI
 * spec (https://raw.githubusercontent.com/sumup/sumup-openapi/refs/heads/main/openapi.json).
 *
 * The fakes honour only documented parameters:
 *   - GET /v2.1/merchants/{merchant_code}/transactions/history: `types[]`,
 *     `limit` (default 10), `changes_since`, `oldest_ref`, `order`; the next
 *     page is a `links` entry `{ rel: 'next', href: 'limit=…&oldest_ref=…&order=ascending' }`;
 *   - GET /v1.0/merchants/{merchant_code}/payouts: `start_date`/`end_date`
 *     (required, `YYYY-MM-DD`, inclusive), `order` (asc|desc), `limit` (1..9999),
 *     returning a bare array.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  _resetCursorPager,
  _resetRowPager,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { SumupAdapter } from '../../../../../../src/verticals/payments/adapters/sumup'
import type { RawSumupTransaction } from '../../../../../../src/verticals/payments/adapters/sumup/transform/charge'
import type { RawSumupPayout } from '../../../../../../src/verticals/payments/adapters/sumup/transform/payout'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { CustomerSchema } from '../../../../../../src/verticals/payments/schema/customer'
import { PayoutSchema } from '../../../../../../src/verticals/payments/schema/payout'
import { CUSTOMER, HISTORY_ROW, PAYOUT_ROW, TRANSACTION_FULL } from './fixtures'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/sumup/client', () => ({
  SumupClient: class {
    get = getMock
    post = vi.fn()
    patch = vi.fn()
    delete = vi.fn()
  },
}))

const CREDS: Credentials = {
  accessToken: 'tok',
  refreshToken: 'ref',
  extra: { merchantCode: 'MH4H92C7' },
}
const NO_MERCHANT: Credentials = { accessToken: 'tok', refreshToken: 'ref' }
const HISTORY = '/v2.1/merchants/MH4H92C7/transactions/history'
const PAYOUTS = '/v1.0/merchants/MH4H92C7/payouts'
const HISTORY_PARAMS = new Set(['types[]', 'limit', 'changes_since', 'oldest_ref', 'order'])
const PAYOUT_PARAMS = new Set(['start_date', 'end_date', 'order', 'limit'])
const DATE = /^\d{4}-\d{2}-\d{2}$/

let txns: RawSumupTransaction[] = []
let payouts: RawSumupPayout[] = []

function fakeHistory(q: Record<string, unknown>) {
  for (const k of Object.keys(q))
    if (!HISTORY_PARAMS.has(k)) throw new Error(`undocumented param ${k}`)
  const limit = Number(q.limit ?? 10)
  const after = q.oldest_ref === undefined ? '' : String(q.oldest_ref)
  const since = q.changes_since === undefined ? 0 : Date.parse(String(q.changes_since))
  const match = txns
    .filter((t) => q['types[]'] === undefined || t.type === q['types[]'])
    .filter((t) => Date.parse(String(t.timestamp)) >= since)
    .filter((t) => String(t.transaction_id) > after)
    .sort((a, b) => String(a.transaction_id).localeCompare(String(b.transaction_id)))
  const items = match.slice(0, limit)
  const links =
    match.length > limit
      ? [
          {
            rel: 'next',
            href: `limit=${limit}&oldest_ref=${items[items.length - 1]!.transaction_id}&order=ascending`,
          },
        ]
      : []
  return { items, links }
}

function fakePayouts(q: Record<string, unknown>) {
  for (const k of Object.keys(q))
    if (!PAYOUT_PARAMS.has(k)) throw new Error(`undocumented param ${k}`)
  const start = String(q.start_date)
  const end = String(q.end_date)
  if (!DATE.test(start) || !DATE.test(end) || end < start)
    throw new Error(`bad window ${start}..${end}`)
  const limit = Number(q.limit ?? 10)
  if (limit < 1 || limit > 9999) throw new Error(`limit ${limit} out of range`)
  const rows = payouts
    .filter((p) => p.date >= start && p.date <= end)
    .sort((a, b) =>
      q.order === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
    )
  return rows.slice(0, limit)
}

function fake(path: string, q: Record<string, unknown> = {}) {
  if (path === HISTORY) return Promise.resolve(fakeHistory(q))
  if (path === PAYOUTS) return Promise.resolve(fakePayouts(q))
  if (path === '/v2.1/merchants/MH4H92C7/transactions' && q.id === TRANSACTION_FULL.id) {
    return Promise.resolve(TRANSACTION_FULL)
  }
  if (path === '/v0.1/customers/831ff8d4cd5958ab5670') return Promise.resolve(CUSTOMER)
  return Promise.reject(new Error(`unexpected path ${path}`))
}

const adapter = new SumupAdapter({
  clientId: 'id',
  clientSecret: 'secret',
  redirectUri: 'https://x/cb',
})

function txn(n: number, type = 'PAYMENT', timestamp = '2026-01-01T00:00:00Z'): RawSumupTransaction {
  return { ...HISTORY_ROW, transaction_id: `t${String(n).padStart(3, '0')}`, type, timestamp }
}

function payout(id: number, date: string, type = 'PAYOUT'): RawSumupPayout {
  return { ...PAYOUT_ROW, id, date, type }
}

async function walk<T>(
  fn: (p: QueryParams) => Promise<T[]>,
  limit: number,
  base: QueryParams = {},
) {
  const pages: { items: T[]; hasMore: boolean | undefined }[] = []
  for (let page = 1; page <= 10; page++) {
    const params = withPageSink({ ...base, page, limit })
    const items = await fn(params)
    const hasMore = readUpstreamPage(params)?.hasMore
    pages.push({ items, hasMore })
    if (!hasMore) break
  }
  return pages
}

beforeEach(() => {
  _resetCursorPager()
  _resetRowPager()
  getMock.mockReset()
  getMock.mockImplementation(fake)
  txns = []
  payouts = []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('sumup refusals', () => {
  it.each([
    ['listCustomers', () => adapter.listCustomers()],
    ['listRefunds', () => adapter.listRefunds()],
    ['getRefund', () => adapter.getRefund()],
    ['getPayout', () => adapter.getPayout()],
    ['listPayouts without updatedAfter', () => adapter.listPayouts(CREDS, { page: 1, limit: 10 })],
    [
      'listCharges without merchantCode',
      () => adapter.listCharges(NO_MERCHANT, { page: 1, limit: 10 }),
    ],
    ['getCharge without merchantCode', () => adapter.getCharge(NO_MERCHANT, 'x')],
    [
      'listPayouts without merchantCode',
      () =>
        adapter.listPayouts(NO_MERCHANT, {
          page: 1,
          limit: 10,
          updatedAfter: new Date('2026-01-01T00:00:00Z'),
        }),
    ],
  ])('%s throws 501 NOT_SUPPORTED and sends nothing', async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('sumup listCharges', () => {
  it('asks the history for PAYMENT rows at the caller limit, with updatedAfter as changes_since', async () => {
    txns = [txn(1)]
    await adapter.listCharges(CREDS, {
      page: 1,
      limit: 25,
      updatedAfter: new Date('2025-12-01T00:00:00Z'),
    })
    expect(getMock).toHaveBeenCalledWith(HISTORY, {
      'types[]': 'PAYMENT',
      limit: 25,
      changes_since: '2025-12-01T00:00:00.000Z',
    })
  })

  it('filters by changes_since upstream', async () => {
    txns = [txn(1, 'PAYMENT', '2025-01-01T00:00:00Z'), txn(2, 'PAYMENT', '2026-02-01T00:00:00Z')]
    const out = await adapter.listCharges(CREDS, {
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-01-01T00:00:00Z'),
    })
    expect(out.map((c) => c.id)).toEqual(['t002'])
  })

  it('walks N = 2L+1 rows by the next link: every id once, hasMore exact, refunds excluded', async () => {
    const L = 2
    txns = [txn(1), txn(2), txn(3, 'REFUND'), txn(4), txn(5), txn(6)]
    const pages = await walk((p) => adapter.listCharges(CREDS, p), L)
    expect(pages.map((p) => p.items.length)).toEqual([2, 2, 1])
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    const ids = pages.flatMap((p) => p.items.map((c) => ChargeSchema.parse(c).id))
    expect(ids).toEqual(['t001', 't002', 't004', 't005', 't006'])
    // Page 2 and 3 carried the documented next-link cursor.
    expect(getMock.mock.calls[1]![1]).toMatchObject({
      oldest_ref: 't002',
      order: 'ascending',
      limit: '2',
    })
  })
})

describe('sumup getCharge / getCustomer', () => {
  it('reads a charge back by the id a list returned', async () => {
    const c = ChargeSchema.parse(
      await adapter.getCharge(CREDS, '410fc44a-5956-44e1-b5cc-19c6f8d727a4'),
    )
    expect(getMock).toHaveBeenCalledWith('/v2.1/merchants/MH4H92C7/transactions', {
      id: '410fc44a-5956-44e1-b5cc-19c6f8d727a4',
    })
    expect(c.id).toBe('410fc44a-5956-44e1-b5cc-19c6f8d727a4')
  })

  it('reads a customer from /v0.1/customers/{customer_id}', async () => {
    const c = CustomerSchema.parse(await adapter.getCustomer(CREDS, '831ff8d4cd5958ab5670'))
    expect(c.id).toBe('831ff8d4cd5958ab5670')
  })
})

describe('sumup listPayouts', () => {
  const since = new Date('2026-01-10T08:00:00Z')

  it('sends one documented month window per request, newest first, starting at updatedAfter', async () => {
    await adapter.listPayouts(CREDS, withPageSink({ page: 1, limit: 100, updatedAfter: since }))
    expect(getMock.mock.calls.map((c) => c[1])).toEqual([
      { start_date: '2026-03-01', end_date: '2026-03-31', order: 'desc', limit: 9999 },
      { start_date: '2026-02-01', end_date: '2026-02-28', order: 'desc', limit: 9999 },
      { start_date: '2026-01-10', end_date: '2026-01-31', order: 'desc', limit: 9999 },
    ])
  })

  it('walks N = 2L+1 payouts over uneven months: every id once, deductions dropped, hasMore exact', async () => {
    const L = 2
    payouts = [
      payout(1, '2026-03-12'),
      payout(2, '2026-03-02'),
      payout(90, '2026-03-05', 'REFUND_DEDUCTION'),
      payout(3, '2026-02-20'),
      payout(4, '2026-01-28'),
      payout(5, '2026-01-10'),
      payout(6, '2026-01-05'), // before updatedAfter's day
    ]
    const pages = await walk((p) => adapter.listPayouts(CREDS, p), L, { updatedAfter: since })
    expect(pages.map((p) => p.items.length)).toEqual([2, 2, 1])
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    const ids = pages.flatMap((p) => p.items.map((x) => PayoutSchema.parse(x).id))
    expect(ids).toEqual(['1', '2', '3', '4', '5'])
  })

  it('fails a month that fills the documented maximum rather than truncating it', async () => {
    payouts = Array.from({ length: 9999 }, (_, i) => payout(i + 1, '2026-03-02'))
    await expect(
      adapter.listPayouts(CREDS, withPageSink({ page: 1, limit: 10, updatedAfter: since })),
    ).rejects.toThrow(/cannot be read whole/)
  })

  it('returns nothing for an updatedAfter in the future', async () => {
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-04-01T00:00:00Z'),
    })
    expect(await adapter.listPayouts(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(getMock).not.toHaveBeenCalled()
  })
})
