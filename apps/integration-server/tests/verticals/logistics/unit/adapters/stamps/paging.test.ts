/**
 * Stamps.com (SERA) listCarriers paging: `GET /v1/carrier-services` returns the
 * account's whole carrier-service catalogue in one response, so the adapter
 * slices the caller's page locally.
 *
 * First-party spec (the OpenAPI document embedded in SERA's Redoc reference):
 * https://developer.stamps.com/rest-api/reference/serav1.html#tag/carriers/operation/get-v1-carrier-services
 *
 *   "/v1/carrier-services": { "get": { "summary": "Get All Available Carrier Services",
 *   ... "parameters": [{ "in": "query", "name": "ship_date", "description": "An optional
 *   query parameter to customize the response to the services and rules available on a
 *   specific date" }] } }
 *
 * The only query parameter is `ship_date`, and the response is a bare
 * `shipping_options` array with no page, offset, cursor or next signal. So page 2
 * of the caller must come from the same request as page 1, sliced by pageLocally.
 * Before this fix the router cut every response to `limit`, page 2 repeated page 1,
 * and carriers past the first page could never be reached.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { StampsAdapter } from '../../../../../../src/verticals/logistics/adapters/stamps/index'

const CREDS = { accessToken: 'tok' }
const CALL_BUDGET = 20
const L = 5
const N = 2 * L + 1
const DOCUMENTED_QUERY = ['ship_date']

/**
 * A fake SERA that honours ONLY the documented request: `GET /v1/carrier-services`
 * with at most the `ship_date` query parameter. It returns every row, as the real
 * endpoint does.
 */
function fakeSera(total: number) {
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (path !== '/v1/carrier-services') throw new Error(`unexpected path ${path}`)
    const bad = Object.entries(cfg?.params ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k)
      .filter((k) => !DOCUMENTED_QUERY.includes(k))
    if (bad.length) throw new Error(`400: undocumented query params ${bad.join(',')}`)
    return {
      data: {
        shipping_options: Array.from({ length: total }, (_, i) => ({
          carrier: `c${i + 1}`,
          services: [{ service_type: 'svc', service_name: 'Service' }],
        })),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), put: vi.fn() } as never)
  return { get }
}

const ids = (from: number, count: number) => Array.from({ length: count }, (_, i) => `c${from + i}`)

afterEach(() => vi.restoreAllMocks())

describe('stamps listCarriers paging', () => {
  const adapter = () => new StampsAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeSera(N)
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
    const { get } = fakeSera(N)
    await adapter().listCarriers(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('/v1/carrier-services')
    const sent = Object.entries(get.mock.calls[0]![1]?.params ?? {}).filter(
      ([, v]) => v !== undefined,
    )
    expect(sent).toEqual([])
  })

  it('a limit above the router maximum is clamped, and serves every row with hasMore false', async () => {
    fakeSera(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listCarriers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(1, N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with exact meta', async () => {
    fakeSera(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listCarriers(CREDS, params), params, 'stamps')
    expect(env.data.map((r) => r.id)).toEqual(ids(L + 1, L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, totalCount: N, hasMore: true }),
    )
  })
})
