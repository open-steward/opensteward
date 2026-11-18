/**
 * pandago list paging: GET /outletList returns every outlet in one response,
 * so the adapter slices the caller's page locally.
 *
 * First-party spec (the OpenAPI document embedded in Delivery Hero's own docs
 * page, https://on-demand-rider-docs.deliveryhero.io/):
 *
 *   GET /outletList — "Get All Outlets"
 *     "Kindly use this endpoint to get all outlets created under a single
 *     parent vendor."
 *     The only declared parameter is the `Authorization` header, and the 200
 *     response is `OutletListResponse`, `"type": "array"` of `OutletList`.
 *
 * There is no page, offset, limit or cursor parameter, so page 2 of the caller
 * must come from the same request as page 1, sliced by pageLocally. Before this
 * fix, the router cut every response to `limit`, page 2 repeated page 1, and
 * outlets past the first page could never be reached.
 *
 * listOrders is NOT covered here: the spec has no `GET /orders` (only
 * `POST /orders` and `GET /orders/{order_id}`), so that method calls an
 * endpoint that does not exist and is rebuild backlog, not a paging fix.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { PandagoAdapter } from '../../../../../../src/verticals/logistics/adapters/pandago/index'

const CREDS = { accessToken: 'tok', extra: { countryCode: 'sg' } }
const CALL_BUDGET = 20
const L = 5
const N = 2 * L + 1

/**
 * A fake pandago that honours ONLY the documented request: GET /outletList
 * with no query parameters, returning the whole outlet array.
 */
function fakePandago(total: number) {
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (cfg?.params !== undefined && Object.keys(cfg.params).length > 0) {
      throw new Error(`400: undocumented query params ${JSON.stringify(cfg.params)}`)
    }
    if (path !== '/outletList') throw new Error(`unexpected path ${path}`)
    return {
      data: Array.from({ length: total }, (_, i) => ({
        client_vendor_id: `o${i + 1}`,
        name: `Outlet ${i + 1}`,
        address: `${i + 1} Main St`,
      })),
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), put: vi.fn() } as never)
  return { get }
}

const ids = (from: number, count: number) => Array.from({ length: count }, (_, i) => `o${from + i}`)

afterEach(() => vi.restoreAllMocks())

describe('pandago listWarehouses paging', () => {
  const adapter = () => new PandagoAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakePandago(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await adapter().listWarehouses(CREDS, params)
      seen.push(...rows.map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ totalCount: N, pagedLocally: true }),
      )
    }
    expect(seen).toEqual(ids(1, N))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request is the documented unpaged GET /outletList, with no invented paging key', async () => {
    const { get } = fakePandago(N)
    await adapter().listWarehouses(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('/outletList')
    const cfg = get.mock.calls[0]![1] as { params?: Record<string, unknown> } | undefined
    expect(cfg?.params ?? {}).toEqual({})
  })

  it('a limit above the router maximum is clamped, and serves every row with hasMore false', async () => {
    fakePandago(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listWarehouses(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(1, N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with exact meta', async () => {
    fakePandago(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listWarehouses(CREDS, params), params, 'pandago')
    expect(env.data.map((r) => r.id)).toEqual(ids(L + 1, L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, totalCount: N, hasMore: true }),
    )
  })
})
