/**
 * Transportify list paging. Transportify is the Philippine brand of Deliveree
 * and uses the same public API.
 *
 * First-party docs: https://developers.deliveree.com/
 *
 *   "Requests that return multiple items are paginated by default, with each
 *   page containing up to 25 items. Use the page parameter to navigate through
 *   pages or specify offsets. Additionally, you can adjust the page size using
 *   the per_page parameter, supporting custom sizes of up to 100 items per
 *   page."
 *
 *   GET /deliveries response: "pagination.next_page | string | Query string
 *   for the next page."
 *
 *   "Get Vehicle Types / We return a list vehicle types of a specific area."
 *   Its only parameter is `pickup_location`, and its response has no
 *   `pagination` block.
 *
 * Before this fix listShipments, listOrders and listTrackingEvents always sent
 * `page=1`, so page 2 repeated page 1, and listCarriers let the router cut the
 * whole vehicle-type list to `limit`, so rows past it were unreachable.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/logistics/adapter/interface'
import { TransportifyAdapter } from '../../../../../../src/verticals/logistics/adapters/transportify/index'

const CREDS = { accessToken: 'tfy_test' }
const CALL_BUDGET = 20
const L = 5
const N = 2 * L + 1
const DOC_DEFAULT = 25
const DOC_MAX = 100

/** The documented query parameters of GET /deliveries. */
const DELIVERY_PARAMS = [
  'page',
  'per_page',
  'from_date',
  'to_date',
  'status',
  'search',
  'sort_by',
  'order_by',
]
/** The only documented query parameter of GET /vehicle_types. */
const VEHICLE_TYPE_PARAMS = ['pickup_location']

type Cfg = { params?: Record<string, unknown> }

/**
 * A fake Transportify that honours ONLY the documented parameters: `page` and
 * `per_page` (default 25, at most 100) on GET /deliveries, returning a
 * `pagination` block whose `next_page` is null on the last page; nothing but
 * `pickup_location` on GET /vehicle_types, which returns every vehicle type.
 * Deliveries are served newest first (ids N..1), as `order_by=desc` asks.
 */
function fakeTransportify(total: number) {
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: Cfg) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    const q = Object.fromEntries(
      Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
    )
    const allowed =
      path === 'deliveries'
        ? DELIVERY_PARAMS
        : path === 'vehicle_types'
          ? VEHICLE_TYPE_PARAMS
          : null
    if (!allowed) throw new Error(`unexpected path ${path}`)
    const bad = Object.keys(q).filter((k) => !allowed.includes(k))
    if (bad.length) throw new Error(`400: undocumented query params ${bad.join(',')}`)

    if (path === 'vehicle_types') {
      return {
        data: {
          data: Array.from({ length: total }, (_, i) => ({ id: i + 1, name: `Vehicle ${i + 1}` })),
        },
      }
    }

    const page = Number(q.page ?? 1)
    const perPage = Math.min(Number(q.per_page ?? DOC_DEFAULT), DOC_MAX)
    const all = Array.from({ length: total }, (_, i) => total - i)
    const slice = all.slice((page - 1) * perPage, page * perPage)
    const more = page * perPage < total
    return {
      data: {
        pagination: {
          total_count: total,
          per_page: perPage,
          next_page: more ? `?page=${page + 1}&per_page=${perPage}` : null,
          previous_page: page > 1 ? `?page=${page - 1}&per_page=${perPage}` : null,
        },
        data: slice.map((id) => ({
          id,
          status: 'delivery_complete',
          job_order_number: `JOB-${id}`,
          updated_at: '2026-01-01T00:00:00Z',
          locations: [],
        })),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

/** Newest-first delivery ids, as the fake serves them. */
const deliveryIds = (from: number, count: number) =>
  Array.from({ length: N }, (_, i) => String(N - i)).slice(from, from + count)
const ascIds = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => String(from + i))

type Lister = (a: TransportifyAdapter, p: QueryParams) => Promise<Array<Record<string, unknown>>>

const DELIVERY_LISTS: Array<[string, Lister, (r: Record<string, unknown>) => unknown]> = [
  ['listShipments', (a, p) => a.listShipments(CREDS, p) as never, (r) => r.id],
  ['listOrders', (a, p) => a.listOrders(CREDS, p) as never, (r) => r.id],
  ['listTrackingEvents', (a, p) => a.listTrackingEvents(CREDS, p) as never, (r) => r.shipmentId],
]

afterEach(() => vi.restoreAllMocks())

describe('transportify deliveries paging (page / per_page)', () => {
  for (const [name, list, idOf] of DELIVERY_LISTS) {
    describe(name, () => {
      it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
        fakeTransportify(N)
        const seen: unknown[] = []
        const more: Array<boolean | undefined> = []
        for (let k = 1; k <= 3; k++) {
          const params = withPageSink({ page: k, limit: L })
          const rows = await list(new TransportifyAdapter(), params)
          seen.push(...rows.map(idOf))
          more.push(readUpstreamPage(params)?.hasMore)
        }
        expect(seen).toEqual(deliveryIds(0, N))
        expect(more).toEqual([true, true, false])
      })

      it('the page-2 request carries the documented page and per_page keys', async () => {
        const { get } = fakeTransportify(N)
        await list(new TransportifyAdapter(), withPageSink({ page: 2, limit: L }))
        expect(get).toHaveBeenCalledTimes(1)
        expect(get.mock.calls[0]![0]).toBe('deliveries')
        const sent = (get.mock.calls[0]![1] as Cfg).params
        expect(sent).toEqual(expect.objectContaining({ page: 2, per_page: L }))
      })

      it('a limit above the documented maximum of 100 is clamped', async () => {
        const { get } = fakeTransportify(N)
        const params = parseListQuery({ page: '1', limit: '100000' }, new TransportifyAdapter())
        expect(params.limit).toBe(DOC_MAX)
        const rows = await list(new TransportifyAdapter(), params)
        expect((get.mock.calls[0]![1] as Cfg).params?.per_page).toBe(DOC_MAX)
        expect(rows.map(idOf)).toEqual(deliveryIds(0, N))
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
      })

      it('a full last page (N = 2L) ends on next_page null, not on a short page', async () => {
        fakeTransportify(2 * L)
        const params = withPageSink({ page: 2, limit: L })
        const rows = await list(new TransportifyAdapter(), params)
        expect(rows).toHaveLength(L)
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
      })

      it('reports pagination.total_count as totalCount', async () => {
        fakeTransportify(N)
        const params = withPageSink({ page: 1, limit: L })
        await list(new TransportifyAdapter(), params)
        expect(readUpstreamPage(params)?.totalCount).toBe(N)
      })

      it('a direct call above 100 sends per_page=100, and no limit sends the documented 25', async () => {
        const { get } = fakeTransportify(N)
        await list(new TransportifyAdapter(), withPageSink({ page: 1, limit: 1000 }))
        await list(new TransportifyAdapter(), withPageSink({ page: 1 }))
        expect((get.mock.calls[0]![1] as Cfg).params?.per_page).toBe(DOC_MAX)
        expect((get.mock.calls[1]![1] as Cfg).params?.per_page).toBe(DOC_DEFAULT)
      })

      it('API path: parseListQuery → adapter → listPage serves page 2 with exact meta', async () => {
        fakeTransportify(N)
        const adapter = new TransportifyAdapter()
        const params = parseListQuery({ page: '2', limit: String(L) }, adapter)
        const env = listPage(await list(adapter, params), params, 'transportify')
        expect(env.data.map(idOf)).toEqual(deliveryIds(L, L))
        expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
      })
    })
  }
})

describe('transportify listCarriers paging (unpaginated vehicle_types, paged locally)', () => {
  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeTransportify(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await new TransportifyAdapter().listCarriers(CREDS, params)
      seen.push(...rows.map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ totalCount: N, pagedLocally: true }),
      )
    }
    expect(seen).toEqual(ascIds(1, N))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request is the documented unpaged GET, with no invented paging key', async () => {
    const { get } = fakeTransportify(N)
    await new TransportifyAdapter().listCarriers(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('vehicle_types')
    const sent = (get.mock.calls[0]![1] as Cfg | undefined)?.params
    expect(sent?.page).toBeUndefined()
    expect(sent?.per_page).toBeUndefined()
  })

  it('a limit above the maximum is clamped, and serves every row with hasMore false', async () => {
    fakeTransportify(N)
    const params = parseListQuery({ page: '1', limit: '100000' }, new TransportifyAdapter())
    expect(params.limit).toBe(DOC_MAX)
    const rows = await new TransportifyAdapter().listCarriers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ascIds(1, N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with exact meta', async () => {
    fakeTransportify(N)
    const adapter = new TransportifyAdapter()
    const params = parseListQuery({ page: '2', limit: String(L) }, adapter)
    const env = listPage(await adapter.listCarriers(CREDS, params), params, 'transportify')
    expect(env.data.map((r) => r.id)).toEqual(ascIds(L + 1, L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, totalCount: N, hasMore: true }),
    )
  })
})
