/**
 * Starshipit list paging. listShipments sent `limit` but never `page`, so
 * page 2 repeated page 1 and nothing past the first page could be reached.
 *
 * GET /api/orders/shipments ("List Orders (Printed or Unmanifested)") is
 * page-number paged. First-party docs, https://api-docs.starshipit.com/
 * (collection: https://api-docs.starshipit.com/api/collections/7606649/TVRg69NS):
 *   limit:       "Amount of results (default: 50) (maximum: 250)"
 *   page:        "Page to show (default: 1)"
 *   total_pages: "Total number of pages available"
 *
 * The documented `status` ("recently_printed, unmanifested") is not sent by
 * the adapter today; the fake does not require it, and adding it is outside
 * this paging fix (recorded as rebuild backlog).
 *
 * listOrders (GET /api/orders, page_number / page_size) and the refused
 * listLabels / listCarriers are covered in rebuild.test.ts.
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
import { StarshipitAdapter } from '../../../../../../src/verticals/logistics/adapters/starshipit/index'

const CREDS = { accessToken: 'ssit_api_key', refreshToken: 'ssit_sub_key' }
const L = 5
const N = 2 * L + 1
/** Documented: "(default: 50) (maximum: 250)". */
const MAX = 250
const DEFAULT = 50
const SHIPMENT_KEYS = new Set(['since_created_date', 'status', 'limit', 'page'])

/** A fake Starshipit that honours ONLY the documented params of GET orders/shipments. */
function fakeStarshipit(rows: number) {
  const log: Array<Record<string, unknown>> = []
  const orders = Array.from({ length: rows }, (_, i) => ({
    order_id: 1000 + i + 1,
    order_number: `ON${i + 1}`,
    date: '2024-05-27T06:00:00.000Z',
    name: 'John Smith',
    carrier_name: 'Australia Post',
    carrier_service_code: '7B05',
    tracking_numbers: [`TN${i + 1}`],
    country: 'Australia',
  }))
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = Object.fromEntries(
      Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
    )
    log.push(params)
    if (path !== 'orders/shipments') throw new Error(`unexpected path ${path}`)
    const bad = Object.keys(params).filter((k) => !SHIPMENT_KEYS.has(k))
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    const limit = params.limit === undefined ? DEFAULT : Number(params.limit)
    if (!(Number.isInteger(limit) && limit >= 1 && limit <= MAX)) {
      throw new Error(`400: limit ${String(params.limit)}`)
    }
    const page = params.page === undefined ? 1 : Number(params.page)
    if (!(Number.isInteger(page) && page >= 1)) throw new Error(`400: page ${String(params.page)}`)
    const start = (page - 1) * limit
    return {
      data: {
        status: 'recently_printed',
        orders: orders.slice(start, start + limit),
        total_pages: Math.ceil(orders.length / limit),
        success: true,
      },
    }
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  })) as never)
  return { get, log }
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => String(1000 + i + 1))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('starshipit listShipments paging (GET orders/shipments: page + limit)', () => {
  it('walks 2L+1 rows at limit L: every id once, in order, hasMore exact', async () => {
    fakeStarshipit(N)
    const adapter = new StarshipitAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listShipments(CREDS, params)
      seen.push(...rows.map((r) => String(r.id)))
      more.push(readUpstreamPage(params)?.hasMore)
      // Not clamped, so no pageSize: the caller's limit is the page size.
      expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
  })

  it('a first-page API call (no ?page) requests page 1 and serves rows 1..L', async () => {
    const { log } = fakeStarshipit(N)
    const params: QueryParams = withPageSink(parseListQuery({ limit: String(L) }))
    expect(params.page).toBeUndefined()
    const rows = await new StarshipitAdapter().listShipments(CREDS, params)
    expect(log).toEqual([{ limit: L, page: 1 }])
    expect(rows.map((r) => String(r.id))).toEqual(ids(N).slice(0, L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('reports no pageSize when the caller sent no limit', async () => {
    fakeStarshipit(N)
    const params = withPageSink({ page: 1 })
    await new StarshipitAdapter().listShipments(CREDS, params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('the page-2 request carries the documented `page` key', async () => {
    const { log } = fakeStarshipit(N)
    await new StarshipitAdapter().listShipments(CREDS, withPageSink({ page: 2, limit: L }))
    expect(log).toEqual([{ limit: L, page: 2 }])
  })

  it('clamps a limit above the documented maximum and reports the size it paged at', async () => {
    const { log } = fakeStarshipit(MAX + 3)
    const params = withPageSink({ page: 1, limit: 400 })
    const rows = await new StarshipitAdapter().listShipments(CREDS, params)
    expect(log[0]).toEqual({ limit: MAX, page: 1 })
    expect(rows).toHaveLength(MAX)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: MAX })

    const p2 = withPageSink({ page: 2, limit: 400 })
    const rest = await new StarshipitAdapter().listShipments(CREDS, p2)
    expect(rest.map((r) => String(r.id))).toEqual(ids(MAX + 3).slice(MAX))
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('serves page 2 through the API path (parseListQuery → listPage)', async () => {
    fakeStarshipit(N)
    const params: QueryParams = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const rows = await new StarshipitAdapter().listShipments(CREDS, params)
    const env = listPage(rows, params, 'starshipit')
    expect(env.data.map((r) => String(r.id))).toEqual(ids(N).slice(L, 2 * L))
    expect(env.meta).toMatchObject({ page: 2, limit: L, hasMore: true })
  })
})
