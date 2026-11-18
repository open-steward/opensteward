/**
 * MyFatoorah subscription paging, against a fake upstream that honours only
 * the documented parameters -- of which there are none.
 *
 * GET /v2/GetRecurringPayment
 * (https://docs.myfatoorah.com/reference/get-recurring-payment):
 *   "Retrieves all recurring payments created in your account. This endpoint
 *    returns a list of all recurring payments with their status, execution
 *    details, and related invoices."
 * The embedded OpenAPI operation declares no parameters and no request body;
 * the response is Data.RecurringPayment[].
 *
 * listSubscriptions used to return that whole array whatever page the caller
 * asked for, so every page repeated the full collection. One response is the
 * whole collection, so the caller's page is cut locally.
 *
 * The fake answers GET at the seam the client uses (the axios instance
 * `axios.create` returns) and rejects any query parameter.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { PageMaxBearing, QueryParams } from '@opensteward/shared'
import { MyfatoorahAdapter } from '../../../../../../src/verticals/payments/adapters/myfatoorah/index'

const creds = { accessToken: 'mf-token' }

let requests: { url: string; params: unknown }[] = []

class UpstreamError extends Error {}

/** Serves `n` recurring payments with RecurringId 1..n (or the given ids). */
function serve(n: number, ids?: string[]) {
  const recurring = Array.from({ length: ids?.length ?? n }, (_, i) => ({
    RecurringId: ids?.[i] ?? String(i + 1),
    RecurringStatus: 'ACTIVE',
    RecurringValue: 10,
    RecurringType: 'Monthly',
  }))
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get: vi.fn(async (url: string, config?: { params?: Record<string, unknown> }) => {
      requests.push({ url, params: config?.params })
      if (url.toLowerCase() !== '/v2/getrecurringpayment') {
        throw new UpstreamError(`unexpected url ${url}`)
      }
      if (config?.params && Object.keys(config.params).length > 0) {
        throw new UpstreamError(`undocumented params ${JSON.stringify(config.params)}`)
      }
      return {
        data: { IsSuccess: true, Message: '', Data: { RecurringPayment: recurring } },
      }
    }),
  })) as unknown as typeof axios.create)
}

function listSubscriptions(params: QueryParams) {
  return new MyfatoorahAdapter().listSubscriptions(creds, params)
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('myfatoorah listSubscriptions paging', () => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | null)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await listSubscriptions(params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(listPage(rows, params, 'myfatoorah').meta.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends no paging parameter on page 2 (none is documented) and reports it paged locally', async () => {
    serve(7)
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await listSubscriptions(params)
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(requests).toHaveLength(1)
    expect(requests[0]!.params).toBeUndefined()
    const reported = readUpstreamPage(params)
    expect(reported?.pagedLocally).toBe(true)
    expect(reported?.totalCount).toBe(7)
    expect(reported?.hasMore).toBe(true)
  })

  it('reports hasMore false on a full last page when rows are an exact multiple of limit', async () => {
    serve(6)
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await listSubscriptions(params)
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves every row when the limit exceeds the collection (no documented maximum)', async () => {
    const N = 1205
    serve(N)
    const params = withPageSink({ page: 1, limit: 5000 })
    const rows = await listSubscriptions(params)
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('answers empty with hasMore false past the end', async () => {
    serve(7)
    const params = withPageSink({ page: 4, limit: 3 })
    expect(await listSubscriptions(params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('passes upstream rows through unchanged, duplicates included, when slicing', async () => {
    serve(0, ['1', '2', '2', '3'])
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await listSubscriptions(params)
    expect(rows.map((r) => r.id)).toEqual(['1', '2', '2', '3'])
    expect(readUpstreamPage(params)?.totalCount).toBe(4)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(7)
    const adapter = new MyfatoorahAdapter()
    const params = parseListQuery({ page: '2', limit: '3' }, adapter as PageMaxBearing)
    const out = listPage(await adapter.listSubscriptions(creds, params), params, 'myfatoorah')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '3' }, adapter as PageMaxBearing)
    const tail = listPage(await adapter.listSubscriptions(creds, last), last, 'myfatoorah')
    expect(tail.data.map((r) => r.id)).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })
})
