/**
 * Authorize.Net subscription paging, against a fake upstream that honours only
 * the documented parameters.
 *
 * ARBGetSubscriptionListRequest
 * (https://developer.authorize.net/api/reference/index.html#recurring-billing-get-a-list-of-subscriptions):
 *   paging.limit: "The number of transactions per page. You can request up to
 *     1000 subscriptions per page of results." / "Decimal, between 1 and 1000."
 *   paging.offset: "The number of the page to return results from. For
 *     example, if you use a limit of 100, setting offset to 1 will return the
 *     first 100 subscriptions, setting offset to 2 will return the second 100
 *     subscriptions, and so forth." / "Decimal, between 1 and 100000."
 *   totalNumInResultSet: "We return a non-zero value for totalNumInResultSet
 *     only for the first page of results, that is, if offset equals 1."
 *
 * listSubscriptions used to send `paging: { limit: 1000, offset: 1 }` whatever
 * the caller asked for, so page 2 repeated page 1 and subscriptions past the
 * first 1000 were unreachable.
 *
 * The fake answers POST /xml/v1/request.api at the seam the client uses (the
 * axios instance `axios.create` returns). `offset` is a PAGE NUMBER, as
 * documented, and the count is reported on offset 1 only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { AuthorizeNetAdapter } from '../../../../../../src/verticals/payments/adapters/authorize-net/index'

const creds = { accessToken: 'txn-key', extra: { loginId: 'login', environment: 'sandbox' } }
const MAX = 1000

interface Paging {
  limit: number
  offset: number
}
let requests: { operation: string; body: Record<string, unknown> }[] = []

class UpstreamError extends Error {}

/** Serves `n` active subscriptions (ids 1..n) and one customer profile holding `profiles` payment profiles. */
function serve(n: number, profiles = 0, { reportCount = true } = {}) {
  const subs = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `s${i + 1}`,
    status: 'active',
    amount: 10,
  }))
  const paymentProfiles = Array.from({ length: profiles }, (_, i) => ({
    customerPaymentProfileId: String(i + 1),
  }))
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    post: vi.fn(async (url: string, envelope: Record<string, Record<string, unknown>>) => {
      if (url !== '/xml/v1/request.api') throw new UpstreamError(`unexpected url ${url}`)
      const [operation, ...extra] = Object.keys(envelope)
      if (!operation || extra.length) throw new UpstreamError('exactly one operation key')
      const body = envelope[operation]!
      requests.push({ operation, body })
      if (operation === 'getCustomerProfileRequest') {
        return { data: { profile: { paymentProfiles }, messages: { resultCode: 'Ok' } } }
      }
      if (operation !== 'ARBGetSubscriptionListRequest') {
        throw new UpstreamError(`unsupported operation ${operation}`)
      }
      // JSON is translated to XML, which requires strict element ordering.
      expect(Object.keys(body)).toEqual([
        'merchantAuthentication',
        'searchType',
        'sorting',
        'paging',
      ])
      // Page boundaries are only stable under a fixed order; the fake serves
      // ids ascending, so anything else asked for is not what it serves.
      if (body['searchType'] !== 'subscriptionActive') {
        throw new UpstreamError(`searchType ${String(body['searchType'])}`)
      }
      expect(body['sorting']).toEqual({ orderBy: 'id', orderDescending: false })
      const paging = body['paging'] as Paging
      expect(Object.keys(paging)).toEqual(['limit', 'offset'])
      const { limit, offset } = paging
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX)
        throw new UpstreamError(`limit ${limit}`)
      if (!Number.isInteger(offset) || offset < 1 || offset > 100_000) {
        throw new UpstreamError(`offset ${offset}`)
      }
      const start = (offset - 1) * limit
      return {
        data: {
          // "Numeric string. Defaults to 0" -- omitted when reportCount is off.
          ...(reportCount ? { totalNumInResultSet: offset === 1 ? n : 0 } : {}),
          subscriptionDetails: subs.slice(start, start + limit),
          messages: { resultCode: 'Ok' },
        },
      }
    }),
  })) as unknown as typeof axios.create)
}

function listSubscriptions(params: QueryParams) {
  return new AuthorizeNetAdapter().listSubscriptions(creds, params)
}

function subscriptionPaging(i = -1): Paging {
  const subs = requests.filter((r) => r.operation === 'ARBGetSubscriptionListRequest')
  return subs.at(i)!.body['paging'] as Paging
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('authorize-net listSubscriptions paging', () => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | null)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await listSubscriptions(params)
      seen.push(...rows.map((r) => r.id))
      const out = listPage(rows, params, 'authorize-net')
      hasMore.push(out.meta.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends paging.offset = page and paging.limit = limit on page 2', async () => {
    serve(7)
    await listSubscriptions(withPageSink({ page: 2, limit: 3 }))
    expect(subscriptionPaging(0)).toEqual({ limit: 3, offset: 2 })
  })

  it('reports the page-1 total, and no total from a later page', async () => {
    serve(7)
    const first = withPageSink({ page: 1, limit: 3 })
    await listSubscriptions(first)
    expect(readUpstreamPage(first)?.totalCount).toBe(7)
    const second = withPageSink({ page: 3, limit: 3 })
    await listSubscriptions(second)
    expect(readUpstreamPage(second)?.totalCount).toBeUndefined()
    expect(readUpstreamPage(second)?.hasMore).toBe(false)
  })

  it('reports hasMore false on a full last page when rows are an exact multiple of limit', async () => {
    serve(6)
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await listSubscriptions(params)
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('clamps a limit above 1000 and still serves every row', async () => {
    const N = 2 * MAX + 5
    serve(N)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 1500 })
      const rows = await listSubscriptions(params)
      seen.push(...rows.map((r) => r.id))
      expect(subscriptionPaging(0).limit).toBe(MAX)
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      requests = []
      if (listPage(rows, params, 'authorize-net').meta.hasMore === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('probes the count with the smallest page at offset 1', async () => {
    serve(7)
    await listSubscriptions(withPageSink({ page: 2, limit: 3 }))
    expect(subscriptionPaging(-1)).toEqual({ limit: 1, offset: 1 })
  })

  it('does not declare the end of a full page when the count is missing', async () => {
    serve(9, 0, { reportCount: false })
    const first = withPageSink({ page: 1, limit: 3 })
    const firstRows = await listSubscriptions(first)
    expect(readUpstreamPage(first)?.totalCount).toBeUndefined()
    expect(listPage(firstRows, first, 'authorize-net').meta.hasMore).not.toBe(false)

    const second = withPageSink({ page: 2, limit: 3 })
    const rows = await listSubscriptions(second)
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(readUpstreamPage(second)?.hasMore).toBeUndefined()
    expect(listPage(rows, second, 'authorize-net').meta.hasMore).not.toBe(false)
  })

  it('answers empty with hasMore false past the documented offset range, without a request', async () => {
    serve(7)
    const params = withPageSink({ page: 100_001, limit: 1 })
    expect(await listSubscriptions(params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(requests).toEqual([])
  })

  it('declares the documented maximum of 1000', () => {
    expect(new AuthorizeNetAdapter().capabilities?.maxPageSize).toBe(MAX)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(7)
    const adapter = new AuthorizeNetAdapter()
    const params = parseListQuery({ page: '2', limit: '3' }, adapter)
    const out = listPage(await adapter.listSubscriptions(creds, params), params, 'authorize-net')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '3' }, adapter)
    const tail = listPage(await adapter.listSubscriptions(creds, last), last, 'authorize-net')
    expect(tail.data.map((r) => r.id)).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })
})

describe('authorize-net listPaymentMethods paging', () => {
  it('pages one customer profile locally: every profile once, in order, with exact hasMore', async () => {
    const L = 2
    serve(0, 2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L, customerId: 'c1' } as QueryParams)
      const rows = await new AuthorizeNetAdapter().listPaymentMethods(creds, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5'])
    expect(hasMore).toEqual([true, true, false])
  })
})
