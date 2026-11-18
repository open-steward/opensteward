/**
 * Shiptheory list paging (https://shiptheory.com/developer/index.html).
 *
 * "Pagination": "page Page number to return. 404 means you have specified a
 * page number without results", "pages Total number of pages with results",
 * "results Total results across all pages". GET /shipments/list: "This method
 * supports paging. ... The maximum limit of results per page for this call is
 * 100."
 *
 * GET /shipments/search documents only "limit ... Allowed range is 1-100
 * shipments" and no page, so listTrackingEvents now reads the paged
 * /shipments/list. GET /services is not paged, so listCarriers serves the
 * caller's page of the whole list.
 *
 * Before this, listShipments and listTrackingEvents always sent `page: 1`, so
 * page 2 repeated page 1; listCarriers returned every carrier on every page.
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
import { ShiptheoryAdapter } from '../../../../../../src/verticals/logistics/adapters/shiptheory/index'

const CREDS = { accessToken: 'jwt_test', refreshToken: 'a@b.test:pw' }
const CALL_BUDGET = 20
const DOC_MAX = 100
const DOC_DEFAULT = 25

function shipments(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    channel_reference_id: `S-${i + 1}`,
    status: 'Complete',
    tracking_number: `T-${i + 1}`,
    created_at: '2026-01-01T00:00:00+0000',
  }))
}

/**
 * A fake Shiptheory /shipments/list honouring ONLY the documented paging
 * parameters: `page` (default 1; a page without results is a 404) and `limit`
 * (default 25, refused above 100), answering with `shipments` and
 * `pagination`. Any other parameter is refused.
 */
function fakeShipments(total: number) {
  const all = shipments(total)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
    if (path !== '/shipments/list') throw new Error(`unexpected path ${path}`)
    const params = cfg?.params ?? {}
    for (const k of Object.keys(params)) {
      if (k !== 'page' && k !== 'limit') throw new Error(`undocumented param ${k}`)
    }
    const page = Number(params.page ?? 1)
    const limit = Number(params.limit ?? DOC_DEFAULT)
    if (limit > DOC_MAX) throw new Error(`limit ${limit} is above the documented maximum`)
    const pages = Math.ceil(all.length / limit)
    const rows = all.slice((page - 1) * limit, page * limit)
    if (rows.length === 0 && page > 1) {
      throw Object.assign(new Error('Request failed with status code 404'), {
        response: { status: 404 },
      })
    }
    return {
      data: {
        shipments: rows,
        pagination: { page, pages, results: all.length, results_per_page: limit, limit },
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

function fakeServices(carriers: string[]) {
  const get = vi.fn(async (path: string) => {
    if (path !== '/services') throw new Error(`unexpected path ${path}`)
    return {
      data: Object.fromEntries(carriers.map((c) => [c, [{ id: `${c}-1`, name: `${c} Parcel` }]])),
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

const ids = (total: number, start: number, count: number) =>
  shipments(total)
    .slice(start, start + count)
    .map((s) => s.channel_reference_id)

const adapter = () => new ShiptheoryAdapter()

afterEach(() => vi.restoreAllMocks())

describe('shiptheory listShipments paging (page + limit)', () => {
  const list = (p: QueryParams) => adapter().listShipments(CREDS, p)

  it('with 2L+1 rows, pages 1..3 at limit L return every shipment once, in order, hasMore exact', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeShipments(N)
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'shiptheory')
      seen.push(...env.data.map((s) => s.id!))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)?.hasMore).toBe(k < 3)
    }
    expect(seen).toEqual(ids(N, 0, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented page and limit', async () => {
    const { get } = fakeShipments(20)
    await list(withPageSink({ page: 2, limit: 7 }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![1]).toEqual(
      expect.objectContaining({ params: { limit: 7, page: 2 } }),
    )
  })

  it('a limit above the documented maximum of 100 is clamped and reported as the page size', async () => {
    const { get } = fakeShipments(250)
    const p1 = withPageSink({ page: 1, limit: 500 })
    const rows = await list(p1)
    expect(rows.map((s) => s.id)).toEqual(ids(250, 0, DOC_MAX))
    expect(readUpstreamPage(p1)).toEqual(
      expect.objectContaining({ pageSize: DOC_MAX, hasMore: true }),
    )
    const p2 = withPageSink({ page: 2, limit: 500 })
    expect((await list(p2)).map((s) => s.id)).toEqual(ids(250, DOC_MAX, DOC_MAX))
    expect(get.mock.calls.map((c) => c[1]?.params)).toEqual([
      { limit: DOC_MAX, page: 1 },
      { limit: DOC_MAX, page: 2 },
    ])
  })

  it('declares the documented maximum', () => {
    expect(adapter().capabilities.maxPageSize).toBe(DOC_MAX)
  })

  it('a page past the end (documented 404) is empty and reports no more', async () => {
    fakeShipments(5)
    const params = withPageSink({ page: 3, limit: 5 })
    const env = listPage(await list(params), params, 'shiptheory')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })

  it('an exact-multiple total ends on the documented `pages`, not on a full page', async () => {
    fakeShipments(8)
    const params = withPageSink({ page: 2, limit: 4 })
    const env = listPage(await list(params), params, 'shiptheory')
    expect(env.data.map((s) => s.id)).toEqual(ids(8, 4, 4))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(env.meta.hasMore).toBe(false)
  })

  it('reports the documented `results` as the total count', async () => {
    fakeShipments(9)
    const params = withPageSink({ page: 1, limit: 4 })
    await list(params)
    expect(readUpstreamPage(params)).toEqual(expect.objectContaining({ totalCount: 9 }))
  })

  // /shipments/list documents no default; 25 is the adapter's own choice (the
  // docs' "?limit=25" example, and search's documented "Defaults to 25").
  it('without a limit, sends an explicit limit of 25', async () => {
    const { get } = fakeShipments(30)
    await list(withPageSink({ page: 1 }))
    expect(get.mock.calls[0]![1]?.params).toEqual({ limit: DOC_DEFAULT, page: 1 })
  })

  it('a non-404 error on a later page still throws (it is not the end of the list)', async () => {
    const get = vi.fn(async () => {
      throw Object.assign(new Error('Request failed with status code 500'), {
        response: { status: 500 },
      })
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
    await expect(list(withPageSink({ page: 2, limit: 4 }))).rejects.toThrow('500')
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakeShipments(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'shiptheory')
    expect(env.data.map((s) => s.id)).toEqual(ids(7, 3, 3))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('shiptheory listTrackingEvents paging (page + limit on /shipments/list)', () => {
  const list = (p: QueryParams) => adapter().listTrackingEvents(CREDS, p)

  it('with 2L+1 shipments, pages 1..3 at limit L return every event once, in order, hasMore exact', async () => {
    const L = 3
    const N = 2 * L + 1
    fakeShipments(N)
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'shiptheory')
      seen.push(...env.data.map((e) => e.shipmentId!))
      hasMore.push(env.meta.hasMore as boolean)
    }
    expect(seen).toEqual(ids(N, 0, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented page and limit', async () => {
    const { get } = fakeShipments(20)
    await list(withPageSink({ page: 2, limit: 6 }))
    expect(get.mock.calls[0]![1]).toEqual(
      expect.objectContaining({ params: { limit: 6, page: 2 } }),
    )
  })

  it('a limit above 100 is clamped', async () => {
    const { get } = fakeShipments(150)
    const params = withPageSink({ page: 1, limit: 400 })
    expect(await list(params)).toHaveLength(DOC_MAX)
    expect(get.mock.calls[0]![1]?.params).toEqual({ limit: DOC_MAX, page: 1 })
    expect(readUpstreamPage(params)).toEqual(expect.objectContaining({ pageSize: DOC_MAX }))
  })

  it('API path: parseListQuery → adapter → listPage', async () => {
    fakeShipments(5)
    const params = parseListQuery({ page: '2', limit: '2' })
    const env = listPage(await list(params), params, 'shiptheory')
    expect(env.data.map((e) => e.shipmentId)).toEqual(ids(5, 2, 2))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('shiptheory listCarriers paging (unpaged /services, paged locally)', () => {
  const CARRIERS = ['A', 'B', 'C', 'D', 'E']
  const list = (p: QueryParams) => adapter().listCarriers(CREDS, p)

  it('with 2L+1 carriers, pages 1..3 at limit L return every carrier once, hasMore exact', async () => {
    const L = 2
    fakeServices(CARRIERS)
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'shiptheory')
      seen.push(...env.data.map((c) => c.id!))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ totalCount: 5, pagedLocally: true }),
      )
    }
    expect(seen).toEqual(CARRIERS)
    expect(hasMore).toEqual([true, true, false])
  })

  it('API path: parseListQuery → adapter → listPage', async () => {
    fakeServices(CARRIERS)
    const params = parseListQuery({ page: '2', limit: '2' })
    const env = listPage(await list(params), params, 'shiptheory')
    expect(env.data.map((c) => c.id)).toEqual(['C', 'D'])
    expect(env.meta.hasMore).toBe(true)
  })

  it('getCarrier still finds a carrier beyond the first page', async () => {
    fakeServices(CARRIERS)
    expect((await adapter().getCarrier(CREDS, 'E')).id).toBe('E')
  })
})
