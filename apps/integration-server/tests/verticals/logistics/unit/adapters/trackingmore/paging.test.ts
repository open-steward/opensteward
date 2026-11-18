/**
 * TrackingMore listCarriers paging. The adapter ignored the caller's `page`,
 * so page 2 repeated page 1.
 *
 * GET /couriers/all takes no query parameters and returns the whole courier
 * list (https://www.trackingmore.com/docs/trackingmore/7496dd3c3c0ac-get-all-couriers:
 * "Return a list of all supported couriers."), so listCarriers slices the
 * whole list with pageLocally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { TrackingMoreAdapter } from '../../../../../../src/verticals/logistics/adapters/trackingmore/index'

const CREDS = { accessToken: 'tm_test' }
const L = 5
const N = 2 * L + 1

/** A fake TrackingMore that returns every courier and rejects any query parameter. */
function fakeTrackingMore(couriers: number) {
  const data = Array.from({ length: couriers }, (_, i) => ({
    courier_code: `c${i + 1}`,
    courier_name: `Courier ${i + 1}`,
  }))
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (path !== '/couriers/all') throw new Error(`unexpected path ${path}`)
    const params = Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined)
    if (params.length) throw new Error('400: /couriers/all takes no params')
    return { data: { meta: { code: 200 }, data } }
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({ get, post: vi.fn() })) as never)
  return { get }
}

const ids = (rows: Array<{ id?: string }>) => rows.map((r) => r.id)
const expected = Array.from({ length: N }, (_, i) => `c${i + 1}`)

afterEach(() => vi.restoreAllMocks())

describe('trackingmore listCarriers paging', () => {
  const adapter = () => new TrackingMoreAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeTrackingMore(N)
    const seen: Array<string | undefined> = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...ids(await adapter().listCarriers(CREDS, params)))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request is the documented parameterless GET /couriers/all', async () => {
    const { get } = fakeTrackingMore(N)
    const rows = await adapter().listCarriers(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('/couriers/all')
    expect(ids(rows)).toEqual(expected.slice(L, 2 * L))
  })

  it('a limit above the maximum is clamped and still serves every row', async () => {
    fakeTrackingMore(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listCarriers(CREDS, params)
    expect(ids(rows)).toEqual(expected)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeTrackingMore(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listCarriers(CREDS, params), params, 'trackingmore')
    expect(ids(env.data)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('getCarrier still finds a courier past the first page', async () => {
    fakeTrackingMore(N)
    const c = await adapter().getCarrier(CREDS, `c${N}`)
    expect(c.id).toBe(`c${N}`)
  })
})
