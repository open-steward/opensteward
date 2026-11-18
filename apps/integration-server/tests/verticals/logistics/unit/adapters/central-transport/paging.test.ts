/**
 * Central Transport `listWarehouses` (Piyovi GET /v1/locations) pages by
 * Page + Limit. Piyovi's first-party OpenAPI, served by the API itself at
 * https://api.piyovi.io/swagger/v1/swagger.json, documents the operation's
 * query parameters as:
 *   "Page"  — "Gets or sets the page number for pagination. Default is 1."
 *   "Limit" — "Gets or sets the number of items per page. Default is 15."
 * and the response (`status` + `payload: LocationListResponse`) as carrying
 *   "hasNextPage" — "Gets or sets a value indicating whether there is a next page."
 *   "totalCount"  — "Gets or sets the total number of items across all pages."
 *
 * Before this, the adapter sent a bare GET: every caller page got Piyovi's
 * default first 15 locations, so page 2 repeated page 1.
 *
 * The spec documents no maximum for Limit, so the adapter declares none and
 * forwards the caller's limit unclamped.
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
import { CentralTransportAdapter } from '../../../../../../src/verticals/logistics/adapters/central-transport/index'

const CREDS = { accessToken: 'piy_test' }
const CALL_BUDGET = 20
const DOC_DEFAULT = 15

function locations(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `loc-${i + 1}`,
    locationName: `Dock ${i + 1}`,
    active: true,
  }))
}

/**
 * A fake Piyovi that honours ONLY the documented paging parameters: `Page`
 * (1-based) and `Limit`, both marked required, answering with the documented
 * `{ status, payload: { data, hasNextPage, totalCount, ... } }` envelope.
 */
type Shape = 'documented' | 'flat' | 'no-hasNextPage' | 'no-end-fields'

/**
 * `shape` exercises the adapter's fallbacks for bodies the spec does not
 * document: a flat body with no `payload`, a payload without `hasNextPage`
 * (end from `totalCount`), and one with neither (end from a short page).
 */
function fakePiyovi(total: number, shape: Shape = 'documented') {
  const all = locations(total)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    if (path !== 'locations') throw new Error(`unexpected path ${path}`)
    const params = cfg?.params ?? {}
    for (const k of Object.keys(params)) {
      if (k !== 'Page' && k !== 'Limit') throw new Error(`undocumented param ${k}`)
    }
    if (params.Page === undefined || params.Limit === undefined) {
      throw new Error('Page and Limit are required')
    }
    const page = Number(params.Page)
    const limit = Number(params.Limit)
    const start = (page - 1) * limit
    const data = all.slice(start, start + limit)
    const body: Record<string, unknown> = {
      success: true,
      data,
      pageNumber: page - 1,
      pageSize: limit,
      totalCount: all.length,
      totalPages: Math.ceil(all.length / limit),
      hasPreviousPage: page > 1,
      hasNextPage: start + limit < all.length,
    }
    if (shape === 'no-hasNextPage' || shape === 'no-end-fields') delete body.hasNextPage
    if (shape === 'no-end-fields') delete body.totalCount
    return { data: shape === 'flat' ? body : { status: 200, payload: body } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), put: vi.fn() } as never)
  return { get }
}

const ids = (total: number, start: number, count: number) =>
  locations(total)
    .slice(start, start + count)
    .map((l) => l.id)

const list = (p: QueryParams) => new CentralTransportAdapter().listWarehouses(CREDS, p)

afterEach(() => vi.restoreAllMocks())

describe('central-transport listWarehouses paging (Page + Limit)', () => {
  it('with 2L+1 rows, pages 1..3 at limit L return every location once, in order, hasMore exact', async () => {
    const L = 4
    const N = 2 * L + 1
    fakePiyovi(N)
    const seen: string[] = []
    const hasMore: boolean[] = []
    const reported: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'central-transport')
      seen.push(...env.data.map((w) => w.id!))
      hasMore.push(env.meta.hasMore as boolean)
      reported.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)).toEqual(expect.objectContaining({ totalCount: N }))
    }
    expect(seen).toEqual(ids(N, 0, N))
    expect(hasMore).toEqual([true, true, false])
    expect(reported).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented Page and Limit', async () => {
    const { get } = fakePiyovi(20)
    await list(withPageSink({ page: 2, limit: 7 }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![1]).toEqual({ params: { Page: 2, Limit: 7 } })
  })

  it('with exactly 2L rows, the full last page reports no more from hasNextPage', async () => {
    const L = 3
    fakePiyovi(2 * L)
    const hasMore: Array<boolean | undefined> = []
    for (let k = 1; k <= 2; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'central-transport')
      expect(env.data.map((w) => w.id)).toEqual(ids(2 * L, (k - 1) * L, L))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
  })

  it('declares no page maximum, since Piyovi documents none for Limit', async () => {
    expect('capabilities' in new CentralTransportAdapter()).toBe(false)
    const { get } = fakePiyovi(3)
    await list(withPageSink({ page: 1, limit: 500 }))
    expect(get.mock.calls[0]![1]).toEqual({ params: { Page: 1, Limit: 500 } })
  })

  it('with no limit, it sends the documented default of 15 and reports that size', async () => {
    const { get } = fakePiyovi(30)
    const params = withPageSink({ page: 1 })
    const rows = await list(params)
    expect(get.mock.calls[0]![1]).toEqual({ params: { Page: 1, Limit: DOC_DEFAULT } })
    expect(rows).toHaveLength(DOC_DEFAULT)
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: true, pageSize: DOC_DEFAULT }),
    )
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakePiyovi(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'central-transport')
    expect(env.data.map((w) => w.id)).toEqual(ids(7, 3, 3))
    expect(env.meta.hasMore).toBe(true)
  })

  it('a flat body without payload is still read, with hasNextPage as the end', async () => {
    fakePiyovi(5, 'flat')
    const params = withPageSink({ page: 1, limit: 3 })
    const rows = await list(params)
    expect(rows.map((w) => w.id)).toEqual(ids(5, 0, 3))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('without hasNextPage, the end comes from totalCount (2L+1 and exactly 2L rows)', async () => {
    const L = 3
    const cases: Array<[number, boolean[]]> = [
      [2 * L + 1, [true, true, false]],
      [2 * L, [true, false]],
    ]
    for (const [n, want] of cases) {
      vi.restoreAllMocks()
      fakePiyovi(n, 'no-hasNextPage')
      const hasMore: Array<boolean | undefined> = []
      for (let k = 1; k <= want.length; k++) {
        const params = withPageSink({ page: k, limit: L })
        await list(params)
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(hasMore).toEqual(want)
    }
  })

  it('with neither hasNextPage nor totalCount, a full page means more and a short page ends', async () => {
    const L = 3
    fakePiyovi(2 * L - 1, 'no-end-fields')
    const hasMore: Array<boolean | undefined> = []
    for (let k = 1; k <= 2; k++) {
      const params = withPageSink({ page: k, limit: L })
      await list(params)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
  })
})
