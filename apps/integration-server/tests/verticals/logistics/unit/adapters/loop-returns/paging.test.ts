/**
 * Loop Returns list paging.
 *
 * `listLabels` (GET /label-requests) pages by limit + offset:
 * https://docs.loopreturns.com/api-reference/latest/label-requests/list-label-requests
 *   "name: limit  description: The per page limit of label requests to return
 *    ... default: 50  minimum: 0  maximum: 250"
 *   "name: offset  description: The number of label requests to offset."
 * The response is `{ data: [...] }` with no total and no next link, so a short
 * page is the only end signal.
 *
 * `listWarehouses` (GET /destinations) is unpaginated:
 * https://docs.loopreturns.com/api-reference/latest/destinations/get-all-destinations
 *   "Retrieve all destinations." — no query parameters, `{ destinations: [...] }`.
 *
 * Before this, listLabels sent `limit` with no `offset`, and listWarehouses
 * truncated the whole list to `limit`: page 2 repeated page 1 for both.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { LoopReturnsAdapter } from '../../../../../../src/verticals/logistics/adapters/loop-returns/index'

const CREDS = { accessToken: 'loop_test' }
const CALL_BUDGET = 20
const LABEL_MAX = 250
const LABEL_DEFAULT = 50

function labelRequests(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: String(1000 + i),
    return_id: 5000 + i,
    shop_id: 50,
    status: 'issued',
    created_at: '2026-01-01T00:00:00Z',
    addresses: null,
    parcel: null,
    products: [],
    errors: [],
  }))
}

function destinations(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    type: 'warehouse',
    name: `Destination ${i + 1}`,
    enabled: true,
    provider_location_id: null,
    address: null,
  }))
}

/**
 * A fake Loop that honours ONLY the documented parameters: `/label-requests`
 * takes `limit` (default 50, refused above 250), `offset` and the documented
 * filters; `/destinations` takes nothing and returns every destination.
 */
function fakeLoop(opts: { labels?: number; destinations?: number } = {}) {
  const allLabels = labelRequests(opts.labels ?? 0)
  const allDest = destinations(opts.destinations ?? 0)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    const params = cfg?.params ?? {}
    if (path === '/label-requests') {
      for (const k of Object.keys(params)) {
        if (!['limit', 'offset', 'from', 'to', 'return_id', 'status'].includes(k))
          throw new Error(`undocumented param ${k}`)
      }
      const limit = Number(params.limit ?? LABEL_DEFAULT)
      if (limit > LABEL_MAX) throw new Error(`limit ${limit} is above the documented maximum`)
      const offset = Number(params.offset ?? 0)
      return { data: { data: allLabels.slice(offset, offset + limit) } }
    }
    if (path === '/destinations') {
      if (Object.keys(params).length > 0) throw new Error('/destinations takes no parameters')
      return { data: { destinations: allDest } }
    }
    throw new Error(`unexpected path ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

const labelIds = (start: number, count: number) =>
  labelRequests(start + count)
    .slice(start)
    .map((l) => l.id)
const destIds = (n: number, start: number, count: number) =>
  destinations(n)
    .slice(start, start + count)
    .map((d) => String(d.id))

const listLabels = (p: QueryParams) => new LoopReturnsAdapter().listLabels(CREDS, p)
const listWarehouses = (p: QueryParams) => new LoopReturnsAdapter().listWarehouses(CREDS, p)

afterEach(() => vi.restoreAllMocks())

describe('loop-returns listLabels paging (limit + offset)', () => {
  it('with 2L+1 rows, pages 1..3 at limit L return every label once, in order, hasMore exact', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeLoop({ labels: N })
    const seen: string[] = []
    const hasMore: boolean[] = []
    const reported: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await listLabels(params), params, 'loop-returns')
      seen.push(...env.data.map((l) => l.id!))
      hasMore.push(env.meta.hasMore as boolean)
      reported.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(labelIds(0, N))
    expect(hasMore).toEqual([true, true, false])
    expect(reported).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented offset and limit', async () => {
    const { get } = fakeLoop({ labels: 20 })
    await listLabels(withPageSink({ page: 2, limit: 7 }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('/label-requests')
    expect(get.mock.calls[0]![1]).toEqual({ params: { limit: 7, offset: 7 } })
  })

  it('keeps the documented filters alongside the paging parameters', async () => {
    const { get } = fakeLoop({ labels: 3 })
    await listLabels(
      withPageSink({
        page: 1,
        limit: 2,
        from: '2026-01-01',
        to: '2026-02-01',
        status: 'issued',
      } as QueryParams),
    )
    expect(get.mock.calls[0]![1]).toEqual({
      params: { from: '2026-01-01', to: '2026-02-01', status: 'issued', limit: 2, offset: 0 },
    })
  })

  it('an in-range limit is sent as-is and reports no pageSize override', async () => {
    fakeLoop({ labels: 20 })
    const params = withPageSink({ page: 1, limit: 7 })
    await listLabels(params)
    expect(readUpstreamPage(params)).not.toHaveProperty('pageSize')
  })

  it('a fractional limit is floored to an integer before it is sent', async () => {
    const { get } = fakeLoop({ labels: 20 })
    await listLabels(withPageSink({ page: 2, limit: 2.5 }))
    expect(get.mock.calls[0]![1]).toEqual({ params: { limit: 2, offset: 2 } })
  })

  it('with no limit, sends the adapter default page size of 100', async () => {
    const { get } = fakeLoop({ labels: 3 })
    await listLabels(withPageSink({ page: 1 }))
    expect(get.mock.calls[0]![1]).toEqual({ params: { limit: 100, offset: 0 } })
  })

  it('a limit above the documented maximum of 250 is clamped, and the stride follows the clamp', async () => {
    const { get } = fakeLoop({ labels: 600 })
    const p1 = withPageSink({ page: 1, limit: 500 })
    const env1 = listPage(await listLabels(p1), p1, 'loop-returns')
    expect(env1.data.map((l) => l.id)).toEqual(labelIds(0, LABEL_MAX))
    expect(env1.meta.hasMore).toBe(true)
    expect(readUpstreamPage(p1)).toEqual(expect.objectContaining({ pageSize: LABEL_MAX }))

    const p2 = withPageSink({ page: 2, limit: 500 })
    const env2 = listPage(await listLabels(p2), p2, 'loop-returns')
    expect(env2.data.map((l) => l.id)).toEqual(labelIds(LABEL_MAX, LABEL_MAX))
    expect(get.mock.calls.map((c) => c[1])).toEqual([
      { params: { limit: LABEL_MAX, offset: 0 } },
      { params: { limit: LABEL_MAX, offset: LABEL_MAX } },
    ])
  })

  it('a page past the end is empty and reports no more', async () => {
    fakeLoop({ labels: 5 })
    const params = withPageSink({ page: 3, limit: 5 })
    const env = listPage(await listLabels(params), params, 'loop-returns')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2', async () => {
    const { get } = fakeLoop({ labels: 7 })
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await listLabels(params), params, 'loop-returns')
    expect(env.data.map((l) => l.id)).toEqual(labelIds(3, 3))
    expect(env.meta.hasMore).toBe(true)
    expect(get.mock.calls[0]![1]).toEqual({ params: { limit: 3, offset: 3 } })
  })
})

describe('loop-returns listWarehouses paging (unpaginated, paged locally)', () => {
  it('with 2L+1 destinations, pages 1..3 at limit L return every destination once, in order, hasMore exact', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeLoop({ destinations: N })
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await listWarehouses(params), params, 'loop-returns')
      seen.push(...env.data.map((w) => w.id!))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ totalCount: N, pagedLocally: true }),
      )
    }
    expect(seen).toEqual(destIds(N, 0, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends no paging parameters, since /destinations documents none', async () => {
    const { get } = fakeLoop({ destinations: 10 })
    await listWarehouses(withPageSink({ page: 2, limit: 3 }))
    expect(get.mock.calls[0]![0]).toBe('/destinations')
    expect(get.mock.calls[0]![1]).toEqual({ params: undefined })
  })

  it('a large limit serves the whole list on page 1', async () => {
    fakeLoop({ destinations: 12 })
    const params = withPageSink({ page: 1, limit: 500 })
    const env = listPage(await listWarehouses(params), params, 'loop-returns')
    expect(env.data.map((w) => w.id)).toEqual(destIds(12, 0, 12))
    expect(env.meta.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2', async () => {
    fakeLoop({ destinations: 7 })
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await listWarehouses(params), params, 'loop-returns')
    expect(env.data.map((w) => w.id)).toEqual(destIds(7, 3, 3))
    expect(env.meta.hasMore).toBe(true)
  })
})
