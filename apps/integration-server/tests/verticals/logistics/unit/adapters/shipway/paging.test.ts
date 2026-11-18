/**
 * Shipway listCarriers paging: GET https://shipway.in/api/carriers returns the
 * whole carrier catalogue in one response, so the adapter slices the caller's
 * page locally.
 *
 * First-party docs (Shipway's own Postman documenter, linked from shipway.in):
 * https://apidocs.shipway.in/ — "Carriers list with ID":
 *   "Using this API, you will get the complete list of all the integrated and
 *    available carriers in our system alongside their Carrier Ids."
 * The documented parameters are Username and Password only (both optional);
 * there is no page, offset or cursor parameter.
 *
 * Before this fix the router cut the response to `limit`, page 2 repeated
 * page 1, and carriers past the first page were unreachable.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { ShipwayAdapter } from '../../../../../../src/verticals/logistics/adapters/shipway/index'

const CREDS = { accessToken: 'user:licence' }
const CALL_BUDGET = 20
const L = 5
const N = 2 * L + 1
const CARRIERS_URL = 'https://shipway.in/api/carriers'
const DOCUMENTED_PARAMS = ['username', 'password']

/**
 * A fake Shipway that honours ONLY the documented request: GET /api/carriers
 * with at most the documented Username/Password parameters. It returns every
 * carrier, as the real endpoint does.
 */
function fakeShipway(total: number) {
  let calls = 0
  const get = vi.fn(async (url: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (url !== CARRIERS_URL) throw new Error(`unexpected url ${url}`)
    const bad = Object.keys(cfg?.params ?? {}).filter(
      (k) => !DOCUMENTED_PARAMS.includes(k.toLowerCase()),
    )
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    return {
      data: {
        status: 'success',
        couriers: Array.from({ length: total }, (_, i) => ({
          id: String(i + 1),
          courier_name: `Courier ${i + 1}`,
          image: null,
        })),
      },
    }
  })
  vi.spyOn(axios, 'get').mockImplementation(get as never)
  return { get }
}

const ids = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => String(from + i))

afterEach(() => vi.restoreAllMocks())

describe('shipway listCarriers paging', () => {
  const adapter = () => new ShipwayAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeShipway(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await adapter().listCarriers(CREDS, params)
      seen.push(...rows.map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ totalCount: N, pagedLocally: true }),
      )
    }
    expect(seen).toEqual(ids(1, N))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request is the documented unpaged GET, with no invented paging key', async () => {
    const { get } = fakeShipway(N)
    await adapter().listCarriers(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe(CARRIERS_URL)
    expect(Object.keys(get.mock.calls[0]![1]?.params ?? {})).toEqual([])
  })

  it('a limit above the router maximum is clamped, and serves every row with hasMore false', async () => {
    fakeShipway(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listCarriers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(1, N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with exact meta', async () => {
    fakeShipway(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listCarriers(CREDS, params), params, 'shipway')
    expect(env.data.map((r) => r.id)).toEqual(ids(L + 1, L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, totalCount: N, hasMore: true }),
    )
  })
})
