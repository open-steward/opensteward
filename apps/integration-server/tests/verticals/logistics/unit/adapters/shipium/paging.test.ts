/**
 * Shipium listWarehouses paging: GET /api/v1/partnerConfiguration/origins
 * returns every origin in one response, so the adapter slices the caller's
 * page locally.
 *
 * First-party doc: https://docs.shipium.com/docs/origin-configuration-api.md
 *   "## Retrieve all origins … **GET**
 *    `https://api.shipium.com/api/v1/partnerConfiguration/origins` …
 *    The request body for this call is empty."
 * The documented response is `orchestratedAssetMetadata` plus `results`, with
 * no page, offset, anchor or count of any kind.
 *
 * Before this fix the router cut the response to `limit`, page 2 repeated
 * page 1, and origins past the first page could never be reached.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { ShipiumAdapter } from '../../../../../../src/verticals/logistics/adapters/shipium/index'

const CREDS = { accessToken: 'keyid:secret' }
const CALL_BUDGET = 20
const L = 5
const N = 2 * L + 1

/**
 * A fake Shipium that honours ONLY the documented request: a GET on
 * /partnerConfiguration/origins with no query parameters, returning every
 * origin.
 */
function fakeShipium(total: number) {
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (path !== '/partnerConfiguration/origins') throw new Error(`unexpected path ${path}`)
    const params = cfg?.params ?? {}
    if (Object.keys(params).length > 0) {
      throw new Error(`400: undocumented query params ${JSON.stringify(params)}`)
    }
    return {
      data: {
        orchestratedAssetMetadata: { orchestrationId: 'o', orchestrationTimeStamp: 't' },
        results: Array.from({ length: total }, (_, i) => ({
          originId: `w${i + 1}`,
          name: `Origin ${i + 1}`,
          originType: 'fc',
        })),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), put: vi.fn() } as never)
  return { get }
}

const ids = (from: number, count: number) => Array.from({ length: count }, (_, i) => `w${from + i}`)

afterEach(() => vi.restoreAllMocks())

describe('shipium listWarehouses paging', () => {
  const adapter = () => new ShipiumAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeShipium(N)
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

  it('the page-2 request is the documented unpaged GET, with no invented paging key', async () => {
    const { get } = fakeShipium(N)
    await adapter().listWarehouses(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('/partnerConfiguration/origins')
    expect(Object.keys(get.mock.calls[0]![1]?.params ?? {})).toEqual([])
  })

  it('a limit above the router maximum is clamped, and serves every row with hasMore false', async () => {
    fakeShipium(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listWarehouses(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(1, N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with exact meta', async () => {
    fakeShipium(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listWarehouses(CREDS, params), params, 'shipium')
    expect(env.data.map((r) => r.id)).toEqual(ids(L + 1, L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, totalCount: N, hasMore: true }),
    )
  })
})
