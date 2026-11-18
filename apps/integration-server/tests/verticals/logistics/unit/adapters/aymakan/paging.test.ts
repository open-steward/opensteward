/**
 * Aymakan `listWarehouses` (GET /v2/dropoff_locations) is not paginated:
 * https://developer.aymakan.com.sa/docs/aymakan-v2/dropoff-locations
 *   "This endpoint will return a list for AyMakan Warehouses locations."
 * The page documents no request parameters and a response of only
 * `{ success, data: [...] }` — no page, limit, cursor or next field.
 *
 * So one response is the whole collection, and the adapter pages it locally.
 * Before this, every caller page returned every location: page 2 repeated
 * page 1 and a sync never saw an end.
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
import { AymakanAdapter } from '../../../../../../src/verticals/logistics/adapters/aymakan/index'

const CREDS = { accessToken: 'aym_test' }
const CALL_BUDGET = 20

function locations(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `WH-${i + 1}`,
    city: 'Riyadh',
    address: `Street ${i + 1}`,
    manager: 'Ali',
    mobile_phone: '0530000000',
    email: 'wh@example.com',
    location_lat: null,
    location_lng: null,
  }))
}

/**
 * A fake Aymakan that honours ONLY what the doc page documents: a bare GET on
 * `dropoff_locations` returning every location. Any query parameter is
 * refused, since none is documented.
 */
function fakeAymakan(total: number) {
  const all = locations(total)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    if (path !== 'dropoff_locations') throw new Error(`unexpected path ${path}`)
    if (cfg?.params && Object.keys(cfg.params).length > 0) {
      throw new Error(`undocumented params sent: ${JSON.stringify(cfg.params)}`)
    }
    return { data: { success: true, data: all } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), delete: vi.fn() } as never)
  return { get }
}

function names(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `WH-${start + i}`)
}

const list = (p: QueryParams) => new AymakanAdapter().listWarehouses(CREDS, p)

afterEach(() => vi.restoreAllMocks())

describe('aymakan listWarehouses paging (unpaginated upstream, paged locally)', () => {
  it('with 2L+1 rows, pages 1..3 at limit L return every location once, in order, hasMore exact', async () => {
    const L = 4
    fakeAymakan(2 * L + 1)
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'aymakan')
      seen.push(...env.data.map((w) => w.name!))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ pagedLocally: true, totalCount: 2 * L + 1 }),
      )
    }
    expect(seen).toEqual(names(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 returns the second slice, not a repeat of page 1, with a bare documented request', async () => {
    const { get } = fakeAymakan(10)
    const page1 = (await list(parseListQuery({ page: '1', limit: '3' }))).map((w) => w.name)
    const page2 = (await list(parseListQuery({ page: '2', limit: '3' }))).map((w) => w.name)
    expect(page1).toEqual(names(1, 3))
    expect(page2).toEqual(names(4, 3))
    // No paging key exists upstream; the only documented request is the bare GET.
    expect(get.mock.calls.map((c) => c[0])).toEqual(['dropoff_locations', 'dropoff_locations'])
  })

  it('a limit larger than the collection returns every location and reports the end', async () => {
    fakeAymakan(5)
    const params = withPageSink({ page: 1, limit: 500 })
    const env = listPage(await list(params), params, 'aymakan')
    expect(env.data.map((w) => w.name)).toEqual(names(1, 5))
    expect(env.meta.hasMore).toBe(false)
  })

  it('pages the WHOLE collection at the sync size: 501 rows at limit 500 end on page 2', async () => {
    fakeAymakan(501)
    const p1 = withPageSink({ page: 1, limit: 500 })
    const env1 = listPage(await list(p1), p1, 'aymakan')
    expect(env1.data).toHaveLength(500)
    expect(env1.meta.hasMore).toBe(true)
    expect(readUpstreamPage(p1)).toEqual(expect.objectContaining({ totalCount: 501 }))
    const p2 = withPageSink({ page: 2, limit: 500 })
    const env2 = listPage(await list(p2), p2, 'aymakan')
    expect(env2.data.map((w) => w.name)).toEqual(['WH-501'])
    expect(env2.meta.hasMore).toBe(false)
  })

  it('a page past the end is empty', async () => {
    fakeAymakan(5)
    expect(await list(parseListQuery({ page: '3', limit: '5' }))).toEqual([])
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakeAymakan(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'aymakan')
    expect(env.data.map((w) => w.name)).toEqual(names(4, 3))
    expect(env.meta.hasMore).toBe(true)
  })
})
