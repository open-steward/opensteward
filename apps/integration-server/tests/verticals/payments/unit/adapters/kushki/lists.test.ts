/**
 * Kushki lists, against a fake of GET /analytics/v2/transactions-list
 * (https://api-docs.kushkipagos.com/mexico/online-payments/analytics/transactions-list-v2.md).
 *
 * The fake honours only documented parameters: `from`/`to` (required,
 * "AAAA-MM-DDTHH:MM:SS"), `transaction_type`, `offset` ("starting record index
 * (0-based)", analytics.md) and `limit` (at most 600). It returns rows newest
 * first ("Transactions are returned in descending order") as `{ total, data }`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { _resetRowPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { KushkiAdapter } from '../../../../../../src/verticals/payments/adapters/kushki'
import type { RawKushkiTransaction } from '../../../../../../src/verticals/payments/adapters/kushki/transform/shared'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { RefundSchema } from '../../../../../../src/verticals/payments/schema/refund'
import { SubscriptionSchema } from '../../../../../../src/verticals/payments/schema/subscription'
import { APPROVED_SALE, DECLINED_SALE, REFUND_ROW, SUBSCRIPTION } from './fixtures'

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/kushki/client', () => ({
  KushkiClient: class {
    get = getMock
    post = postMock
    delete = vi.fn()
  },
}))

const CREDS = { accessToken: 'private-key' }
const DOCUMENTED = new Set(['from', 'to', 'transaction_type', 'offset', 'limit'])
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/

let rows: RawKushkiTransaction[] = []

function fakeTransactionsList(path: string, q: Record<string, unknown>) {
  if (path !== '/analytics/v2/transactions-list') throw new Error(`unexpected path ${path}`)
  for (const k of Object.keys(q)) if (!DOCUMENTED.has(k)) throw new Error(`undocumented param ${k}`)
  const from = String(q.from)
  const to = String(q.to)
  if (!DATE.test(from) || !DATE.test(to)) throw new Error(`bad window ${from}..${to}`)
  const limit = Number(q.limit ?? 100)
  if (limit < 1 || limit > 600) throw new Error(`limit ${limit} out of range`)
  const offset = Number(q.offset ?? 0)
  const lo = Date.parse(`${from}Z`)
  const hi = Date.parse(`${to}Z`)
  const match = rows
    .filter((r) => r.transaction_type === q.transaction_type)
    .filter((r) => {
      const t = Date.parse(String(r.created))
      return t >= lo && t <= hi + 999
    })
    .sort((a, b) => Date.parse(String(b.created)) - Date.parse(String(a.created)))
  return Promise.resolve({ total: match.length, data: match.slice(offset, offset + limit) })
}

function sale(ticket: string | undefined, created: string): RawKushkiTransaction {
  return { ...(ticket ? APPROVED_SALE : DECLINED_SALE), ticket_number: ticket, created }
}

const adapter = new KushkiAdapter()

beforeEach(() => {
  _resetRowPager()
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(fakeTransactionsList)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('kushki refusals', () => {
  it.each([
    ['listCustomers', () => adapter.listCustomers()],
    ['getCustomer', () => adapter.getCustomer()],
    ['listSubscriptions', () => adapter.listSubscriptions()],
    ['getCharge', () => adapter.getCharge()],
    [
      'listCharges without updatedAfter',
      () => adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 10 })),
    ],
    [
      'listRefunds without updatedAfter',
      () => adapter.listRefunds(CREDS, withPageSink({ page: 1, limit: 10 })),
    ],
  ])('%s throws 501 NOT_SUPPORTED and sends nothing', async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })
})

describe('kushki listCharges (date-windowed walk)', () => {
  // L = 3, N = 2L + 1 = 7 charges. March holds 2, February none, January 5
  // (one of them before updatedAfter, so outside the walk). A declined SALE
  // with no ticket_number sits in January and is skipped.
  const updatedAfter = new Date('2026-01-10T00:00:00Z')
  beforeEach(() => {
    rows = [
      sale('m1', '2026-03-14T10:00:00.000Z'),
      sale('m2', '2026-03-01T00:00:00.000Z'),
      sale('j1', '2026-01-31T23:59:59.000Z'),
      sale(undefined, '2026-01-30T00:00:00.000Z'),
      sale('j2', '2026-01-25T00:00:00.000Z'),
      sale('j3', '2026-01-20T00:00:00.000Z'),
      sale('j4', '2026-01-15T00:00:00.000Z'),
      sale('j5', '2026-01-10T00:00:00.000Z'),
      sale('old', '2026-01-09T23:59:59.000Z'),
      { ...REFUND_ROW, created: '2026-03-02T00:00:00.000Z' },
    ]
  })

  it('walks every charge once, newest first, with exact hasMore', async () => {
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params: QueryParams = withPageSink({ page, limit: 3, updatedAfter })
      const got = await adapter.listCharges(CREDS, params)
      seen.push(...got.map((c) => ChargeSchema.parse(c).id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['m1', 'm2', 'j1', 'j2', 'j3', 'j4', 'j5'])
    expect(new Set(seen).size).toBe(7)
    expect(more).toEqual([true, true, false])
  })

  it('sends UTC calendar-month windows bounded below by updatedAfter', async () => {
    await adapter.listCharges(CREDS, withPageSink({ page: 3, limit: 3, updatedAfter }))
    const windows = getMock.mock.calls.map(([, q]) => `${q.from}..${q.to}`)
    expect(windows).toContain('2026-03-01T00:00:00..2026-03-31T23:59:59')
    expect(windows).toContain('2026-02-01T00:00:00..2026-02-28T23:59:59')
    expect(windows).toContain('2026-01-10T00:00:00..2026-01-31T23:59:59')
    for (const [, q] of getMock.mock.calls) expect(q.transaction_type).toBe('SALE')
  })

  it('pages within a window by record offset and the caller limit', async () => {
    await adapter.listCharges(CREDS, withPageSink({ page: 3, limit: 3, updatedAfter }))
    const jan = getMock.mock.calls
      .map(([, q]) => q)
      .filter((q) => String(q.from).startsWith('2026-01'))
    expect(jan.map((q) => q.offset)).toEqual([0, 3])
    for (const q of jan) expect(q.limit).toBe(3)
  })

  it('clamps the upstream limit to the documented 600', async () => {
    await adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 1000, updatedAfter }))
    for (const [, q] of getMock.mock.calls) expect(q.limit).toBe(600)
  })

  it('returns an empty last page when updatedAfter is in the future', async () => {
    const params = withPageSink({
      page: 1,
      limit: 3,
      updatedAfter: new Date('2027-01-01T00:00:00Z'),
    })
    expect(await adapter.listCharges(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('kushki listRefunds', () => {
  it('lists REFUND rows of the window', async () => {
    rows = [
      { ...REFUND_ROW, created: '2026-03-02T00:00:00.000Z' },
      sale('m1', '2026-03-14T10:00:00.000Z'),
    ]
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-03-01T00:00:00Z'),
    })
    const got = await adapter.listRefunds(CREDS, params)
    expect(got.map((r) => RefundSchema.parse(r)).map((r) => [r.id, r.chargeId])).toEqual([
      ['661738684712571670', '029184246439606168'],
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    for (const [, q] of getMock.mock.calls) expect(q.transaction_type).toBe('REFUND')
  })
})

describe('kushki walk keys and guards', () => {
  it('skips REFUND rows without a ticket_number', async () => {
    rows = [
      { ...REFUND_ROW, created: '2026-03-02T00:00:00.000Z' },
      { ...REFUND_ROW, ticket_number: undefined, created: '2026-03-03T00:00:00.000Z' },
    ]
    const got = await adapter.listRefunds(
      CREDS,
      withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2026-03-01T00:00:00Z') }),
    )
    expect(got.map((r) => r.id)).toEqual(['661738684712571670'])
  })

  // Page 1 is always read afresh (row-pager.ts), so each test reads page 2 of
  // one walk right after page 1 of another: a shared key would serve the
  // other walk's cached rows.
  it('does not share a cached walk between charges and refunds', async () => {
    rows = [
      sale('m1', '2026-03-14T10:00:00.000Z'),
      sale('m2', '2026-03-13T10:00:00.000Z'),
      { ...REFUND_ROW, ticket_number: 'r1', created: '2026-03-12T00:00:00.000Z' },
      { ...REFUND_ROW, ticket_number: 'r2', created: '2026-03-11T00:00:00.000Z' },
    ]
    const updatedAfter = new Date('2026-03-01T00:00:00Z')
    await adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 1, updatedAfter }))
    const refunds = await adapter.listRefunds(
      CREDS,
      withPageSink({ page: 2, limit: 1, updatedAfter }),
    )
    expect(refunds.map((r) => r.id)).toEqual(['r2'])
  })

  it('does not share a cached walk between different updatedAfter bounds', async () => {
    rows = [
      sale('m1', '2026-03-14T10:00:00.000Z'),
      sale('j1', '2026-01-20T00:00:00.000Z'),
      sale('j2', '2026-01-19T00:00:00.000Z'),
    ]
    await adapter.listCharges(
      CREDS,
      withPageSink({ page: 1, limit: 1, updatedAfter: new Date('2026-03-01T00:00:00Z') }),
    )
    const params = withPageSink({
      page: 2,
      limit: 1,
      updatedAfter: new Date('2026-01-01T00:00:00Z'),
    })
    expect((await adapter.listCharges(CREDS, params)).map((c) => c.id)).toEqual(['j1'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('starts a fresh walk when the newest month changes', async () => {
    const updatedAfter = new Date('2026-03-01T00:00:00Z')
    // 20 s apart across a month boundary, inside the pager's 60 s cache TTL.
    vi.setSystemTime(new Date('2026-03-31T23:59:50Z'))
    rows = [sale('m1', '2026-03-14T10:00:00.000Z'), sale('m2', '2026-03-13T10:00:00.000Z')]
    await adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 1, updatedAfter }))
    vi.setSystemTime(new Date('2026-04-01T00:00:10Z'))
    rows = [sale('a1', '2026-04-01T00:00:05.000Z'), ...rows]
    // The fresh walk is a1, m1, m2. March's cached walk would give m2 here.
    const got = await adapter.listCharges(CREDS, withPageSink({ page: 2, limit: 1, updatedAfter }))
    expect(got.map((c) => c.id)).toEqual(['m1'])
  })

  it('moves to the next month when a page is empty although total says more', async () => {
    getMock.mockImplementation(() => Promise.resolve({ total: 5, data: [] }))
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-01-10T00:00:00Z'),
    })
    expect(await adapter.listCharges(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    // One request per month: March, February, January.
    expect(getMock).toHaveBeenCalledTimes(3)
  })
})

describe('kushki getSubscription', () => {
  it('reads the root body of GET /subscriptions/v1/card/search/{subscriptionId}', async () => {
    getMock.mockResolvedValueOnce(SUBSCRIPTION)
    const s = await adapter.getSubscription(CREDS, '1574693127852000')
    expect(getMock).toHaveBeenCalledWith('/subscriptions/v1/card/search/1574693127852000')
    expect(SubscriptionSchema.parse(s).id).toBe('1574693127852000')
  })
})
