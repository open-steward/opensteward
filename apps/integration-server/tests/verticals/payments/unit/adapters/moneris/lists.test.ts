/**
 * Moneris lists and gets, against a fake of the Moneris API 2.15.1 list
 * endpoints (https://developer.moneris.com/moneris-api/reference/getpayments.md,
 * getcustomers.md, getrefunds.md, getsubscriptions.md).
 *
 * The fake honours only the documented query parameters: `cursor`
 * ("Pagination cursor to return items located after it."), `limit`
 * (`"default": 10, "minimum": 1, "maximum": 20`), `created_from` and
 * `created_to` ("must be no more than 1 day later than `created_from`
 * date"). It answers with the documented envelope `{ data, self, first,
 * last, next, previous }`, `next` being a link such as
 * `/payments?cursor=d41d8cd98f00b&limit=50`, or null on the last page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { _resetRowPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { MonerisAdapter } from '../../../../../../src/verticals/payments/adapters/moneris'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { CustomerSchema } from '../../../../../../src/verticals/payments/schema/customer'
import { RefundSchema } from '../../../../../../src/verticals/payments/schema/refund'
import { SubscriptionSchema } from '../../../../../../src/verticals/payments/schema/subscription'
import { CUSTOMER, PAYMENT_SUCCEEDED, REFUND_SUCCEEDED, SUBSCRIPTION } from './fixtures'

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/moneris/client', () => ({
  MonerisClient: class {
    get = getMock
    post = postMock
    delete = vi.fn()
  },
}))

const CREDS = { accessToken: 'key_live', extra: { merchantId: '0123456789101' } }
const DOCUMENTED = new Set(['cursor', 'limit', 'created_from', 'created_to'])
const DAY = 86_400_000

type Row = { id: string; createdAt: string; path: string }
let rows: Row[] = []
/**
 * The documented `cursor` is opaque. By default the fake mints item offsets
 * (`c<offset>`), which mean the same position at any `limit`; with
 * `pageCursors` it mints page numbers (`p<n>`, at offset n × limit), which do
 * not, so a cursor replayed at another limit lands elsewhere.
 */
let pageCursors = false

function fakeList(path: string, q: Record<string, unknown> = {}) {
  for (const k of Object.keys(q)) if (!DOCUMENTED.has(k)) throw new Error(`undocumented param ${k}`)
  const limit = Number(q.limit ?? 10)
  if (!(limit >= 1 && limit <= 20)) throw new Error(`limit ${limit} out of range`)
  const from = Date.parse(String(q.created_from))
  const to = Date.parse(String(q.created_to))
  if (!(from < to) || to - from > DAY)
    throw new Error(`bad window ${q.created_from}..${q.created_to}`)
  const match = rows
    .filter((r) => r.path === path)
    .filter((r) => {
      const t = Date.parse(r.createdAt)
      // Strictly inside: created_from "Returns items created after the specified
      // date", created_to "Returns items created before the specified date".
      return t > from && t < to
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const n = q.cursor === undefined ? 0 : Number(String(q.cursor).slice(1))
  const offset = pageCursors ? n * limit : n
  const data = match.slice(offset, offset + limit).map((r) => {
    if (path === '/payments')
      return { ...PAYMENT_SUCCEEDED, paymentId: r.id, createdAt: r.createdAt }
    if (path === '/refunds') return { ...REFUND_SUCCEEDED, refundId: r.id, createdAt: r.createdAt }
    if (path === '/customers') return { ...CUSTOMER, customerId: r.id, createdAt: r.createdAt }
    return { ...SUBSCRIPTION, subscriptionId: r.id, createdAt: r.createdAt }
  })
  const end = offset + limit
  const link = (c: number) =>
    pageCursors
      ? `${path}?cursor=p${c / limit}&limit=${limit}`
      : `${path}?cursor=c${c}&limit=${limit}`
  return Promise.resolve({
    data,
    self: link(offset),
    first: link(0),
    last: null,
    next: end < match.length ? link(end) : null,
    previous: null,
  })
}

const adapter = new MonerisAdapter()
const updatedAfter = new Date('2026-03-10T06:00:00Z')

beforeEach(() => {
  _resetRowPager()
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(fakeList)
  pageCursors = false
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('moneris refusals', () => {
  it.each([
    ['listCustomers', () => adapter.listCustomers(CREDS, withPageSink({ page: 1, limit: 10 }))],
    ['listCharges', () => adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 10 }))],
    ['listRefunds', () => adapter.listRefunds(CREDS, withPageSink({ page: 1, limit: 10 }))],
    [
      'listSubscriptions',
      () => adapter.listSubscriptions(CREDS, withPageSink({ page: 1, limit: 10 })),
    ],
  ])('%s without updatedAfter throws 501 NOT_SUPPORTED and sends nothing', async (_n, call) => {
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('refuses a list on a connection with no merchant id', async () => {
    await expect(
      adapter.listCharges({ accessToken: 'key_live' }, withPageSink({ page: 1, updatedAfter })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('moneris listCharges (day-windowed walk over GET /payments)', () => {
  // L = 3, N = 2L + 1 = 7. Today (the 15th) holds 2, the 14th none, the 13th
  // 4 (two upstream pages at limit 3: 3 then 1), the 10th one after
  // updatedAfter and one before it, the 9th one outside the walk.
  beforeEach(() => {
    const at = (id: string, createdAt: string): Row => ({ id, createdAt, path: '/payments' })
    rows = [
      at('p15a', '2026-03-15T10:00:00.000Z'),
      at('p15b', '2026-03-15T01:00:00.000Z'),
      at('p13a', '2026-03-13T23:00:00.000Z'),
      at('p13b', '2026-03-13T20:00:00.000Z'),
      at('p13c', '2026-03-13T10:00:00.000Z'),
      // Not on midnight: the docs do not say whether a window's bounds are
      // inclusive, so no test depends on either reading.
      at('p13d', '2026-03-13T00:00:01.000Z'),
      at('p10a', '2026-03-10T08:00:00.000Z'),
      at('old1', '2026-03-10T05:00:00.000Z'),
      at('old2', '2026-03-09T12:00:00.000Z'),
      { id: 'r1', createdAt: '2026-03-15T09:00:00.000Z', path: '/refunds' },
    ]
  })

  it('walks every charge once, newest day first, with exact hasMore', async () => {
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params: QueryParams = withPageSink({ page, limit: 3, updatedAfter })
      const got = await adapter.listCharges(CREDS, params)
      seen.push(...got.map((c) => ChargeSchema.parse(c).id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['p15a', 'p15b', 'p13a', 'p13b', 'p13c', 'p13d', 'p10a'])
    expect(new Set(seen).size).toBe(7)
    expect(more).toEqual([true, true, false])
    for (const [path] of getMock.mock.calls) expect(path).toBe('/payments')
  })

  it('sends UTC day windows, the newest ending now and the oldest starting at updatedAfter', async () => {
    await adapter.listCharges(CREDS, withPageSink({ page: 3, limit: 3, updatedAfter }))
    const windows = [
      ...new Set(getMock.mock.calls.map(([, q]) => `${q.created_from}..${q.created_to}`)),
    ]
    expect(windows).toEqual([
      '2026-03-15T00:00:00.000Z..2026-03-15T12:00:00.000Z',
      '2026-03-14T00:00:00.000Z..2026-03-15T00:00:00.000Z',
      '2026-03-13T00:00:00.000Z..2026-03-14T00:00:00.000Z',
      '2026-03-12T00:00:00.000Z..2026-03-13T00:00:00.000Z',
      '2026-03-11T00:00:00.000Z..2026-03-12T00:00:00.000Z',
      '2026-03-10T06:00:00.000Z..2026-03-11T00:00:00.000Z',
    ])
  })

  it('pages within a day by the cursor of the next link, at the caller limit', async () => {
    await adapter.listCharges(CREDS, withPageSink({ page: 3, limit: 3, updatedAfter }))
    const day13 = getMock.mock.calls
      .map(([, q]) => q)
      .filter((q) => String(q.created_from).startsWith('2026-03-13'))
    expect(day13.map((q) => q.cursor)).toEqual([undefined, 'c3'])
    for (const [, q] of getMock.mock.calls) expect(q.limit).toBe(3)
  })

  it('clamps the upstream limit to the documented maximum of 20', async () => {
    const got = await adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 50, updatedAfter }))
    expect(got).toHaveLength(7)
    for (const [, q] of getMock.mock.calls) expect(q.limit).toBe(20)
  })

  it('throws on a next link that carries no cursor rather than ending the walk', async () => {
    getMock.mockResolvedValueOnce({ data: [], next: '/payments?limit=3' })
    await expect(
      adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 3, updatedAfter })),
    ).rejects.toThrow(/next link without a cursor/)
  })

  // The row pager's key must carry every filter, the upstream page size and
  // the day the walk is anchored to: a page 2 must never resume a walk made
  // under another of them.
  it('does not resume a walk made from another updatedAfter', async () => {
    const since15 = new Date('2026-03-15T00:00:00Z')
    const p1 = withPageSink({ page: 1, limit: 2, updatedAfter: since15 })
    expect((await adapter.listCharges(CREDS, p1)).map((c) => c.id)).toEqual(['p15a', 'p15b'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const got = await adapter.listCharges(CREDS, withPageSink({ page: 2, limit: 2, updatedAfter }))
    expect(got.map((c) => c.id)).toEqual(['p13a', 'p13b'])
  })

  it('does not resume a walk made at another upstream page size', async () => {
    pageCursors = true
    rows = ['a', 'b', 'c', 'd', 'e'].map((x, i) => ({
      id: `p15${x}`,
      createdAt: new Date(Date.parse('2026-03-15T10:00:00Z') - i * 60_000).toISOString(),
      path: '/payments',
    }))
    // Size 2: fetches p0 (a, b) and peeks p1 (c, d).
    await adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 2, updatedAfter }))
    // Size 4: rows [4, 8) are e alone. A cursor minted at size 2 means
    // another position at size 4.
    const got = await adapter.listCharges(CREDS, withPageSink({ page: 2, limit: 4, updatedAfter }))
    expect(got.map((c) => c.id)).toEqual(['p15e'])
  })

  it('starts a new walk on a new UTC day', async () => {
    // Within the pager's idle TTL, so only the key keeps the walks apart.
    vi.setSystemTime(new Date('2026-03-15T23:59:50Z'))
    await adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 2, updatedAfter }))
    rows = [...rows, { id: 'p16a', createdAt: '2026-03-16T00:00:05.000Z', path: '/payments' }]
    vi.setSystemTime(new Date('2026-03-16T00:00:10Z'))
    const got = await adapter.listCharges(CREDS, withPageSink({ page: 2, limit: 2, updatedAfter }))
    // The new day's stream is p16a, p15a, p15b, p13a, … so page 2 is p15b, p13a.
    expect(got.map((c) => c.id)).toEqual(['p15b', 'p13a'])
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

describe('moneris other lists', () => {
  const since = new Date('2026-03-15T00:00:00Z')
  beforeEach(() => {
    rows = [
      { id: 'pay1', createdAt: '2026-03-15T08:00:00.000Z', path: '/payments' },
      {
        id: 'ri0105ARZ3NDEKTSV4RRFFQ69G5FAV',
        createdAt: '2026-03-15T09:00:00.000Z',
        path: '/refunds',
      },
      {
        id: 'ci0105ARZ3NDEKTSV4RRFFQ69G5FAV',
        createdAt: '2026-03-15T09:00:00.000Z',
        path: '/customers',
      },
      {
        id: 'rp0105ARZ3NDEKTSV4RRFFQ69G5FAV',
        createdAt: '2026-03-15T09:00:00.000Z',
        path: '/subscriptions',
      },
    ]
  })

  it('lists refunds from GET /refunds', async () => {
    const params = withPageSink({ page: 1, limit: 10, updatedAfter: since })
    const got = await adapter.listRefunds(CREDS, params)
    expect(got.map((r) => RefundSchema.parse(r).id)).toEqual(['ri0105ARZ3NDEKTSV4RRFFQ69G5FAV'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(getMock.mock.calls.map(([p]) => p)).toEqual(['/refunds'])
  })

  it('lists customers from GET /customers', async () => {
    const got = await adapter.listCustomers(
      CREDS,
      withPageSink({ page: 1, limit: 10, updatedAfter: since }),
    )
    expect(got.map((c) => CustomerSchema.parse(c).id)).toEqual(['ci0105ARZ3NDEKTSV4RRFFQ69G5FAV'])
    expect(getMock.mock.calls.map(([p]) => p)).toEqual(['/customers'])
  })

  it('lists subscriptions from GET /subscriptions', async () => {
    const got = await adapter.listSubscriptions(
      CREDS,
      withPageSink({ page: 1, limit: 10, updatedAfter: since }),
    )
    expect(got.map((s) => SubscriptionSchema.parse(s).id)).toEqual([
      'rp0105ARZ3NDEKTSV4RRFFQ69G5FAV',
    ])
    expect(getMock.mock.calls.map(([p]) => p)).toEqual(['/subscriptions'])
  })

  // Page 1 is always read afresh, so page 2 right after another resource's
  // page 1 would serve that walk's rows if the keys were shared.
  it('does not share a cached walk between resources', async () => {
    const more = [
      { id: 'pay2', createdAt: '2026-03-15T07:00:00.000Z', path: '/payments' },
      {
        id: 'ri0205ARZ3NDEKTSV4RRFFQ69G5FAV',
        createdAt: '2026-03-15T07:00:00.000Z',
        path: '/refunds',
      },
    ]
    rows = [...rows, ...more]
    await adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 1, updatedAfter: since }))
    await adapter.listRefunds(CREDS, withPageSink({ page: 1, limit: 1, updatedAfter: since }))
    const page2 = await adapter.listCharges(
      CREDS,
      withPageSink({ page: 2, limit: 1, updatedAfter: since }),
    )
    expect(page2.map((c) => c.id)).toEqual(['pay2'])
  })
})

describe('moneris gets', () => {
  it('getCharge reads GET /payments/{payment-id}, a bare payment', async () => {
    getMock.mockResolvedValue(PAYMENT_SUCCEEDED)
    const c = await adapter.getCharge(CREDS, 'pi0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(getMock).toHaveBeenCalledWith('/payments/pi0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(ChargeSchema.parse(c).id).toBe('pi0105ARZ3NDEKTSV4RRFFQ69G5FAV')
  })

  it('getCustomer reads GET /customers/{customer-id}, a bare customer', async () => {
    getMock.mockResolvedValue(CUSTOMER)
    const c = await adapter.getCustomer(CREDS, 'ci0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(getMock).toHaveBeenCalledWith('/customers/ci0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(CustomerSchema.parse(c).id).toBe('ci0105ARZ3NDEKTSV4RRFFQ69G5FAV')
  })

  it('getSubscription reads GET /subscriptions/{subscription-id}, a bare subscription', async () => {
    getMock.mockResolvedValue(SUBSCRIPTION)
    const s = await adapter.getSubscription(CREDS, 'rp0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(getMock).toHaveBeenCalledWith('/subscriptions/rp0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(SubscriptionSchema.parse(s).id).toBe('rp0105ARZ3NDEKTSV4RRFFQ69G5FAV')
  })
})
