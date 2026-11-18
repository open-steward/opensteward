/**
 * NextBillion.ai list paging. listTrackingEvents ignored the caller's `page`
 * (it sent an undocumented `limit` and no page number), so page 2 repeated
 * page 1 and no asset past the first upstream page could be reached.
 *
 * GET /skynet/asset/list is page-numbered. First-party spec,
 * https://docs.nextbillion.io/openapi.json (the spec docs.nextbillion.ai renders):
 *   pn: "Denotes page number. Use this along with the `ps` parameter to
 *        implement pagination for your searched results." (default 1)
 *   ps: "Denotes number of search results per page." (default 20, maximum 100)
 *   data.page.hasmore: "A boolean value indicating whether there are more
 *        items available beyond the current page."
 *
 * One event is emitted per asset that has a last location, so an upstream page
 * of assets is not a caller page of events: the adapter pages by rows.
 *
 * listShipments is NOT covered: GET /fleetify/routes is not a documented
 * endpoint (only POST exists), so it gets no paging fix.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import { NextBillionAiAdapter } from '../../../../../../src/verticals/logistics/adapters/nextbillion-ai/index'

const CREDS = { accessToken: 'nb_test_key' }
const OTHER = { accessToken: 'nb_other_key' }
const CALL_BUDGET = 400
const L = 5
const N = 2 * L + 1
const MAX = 100
const LIST_KEYS = new Set([
  'key',
  'tags',
  'pn',
  'ps',
  'sort',
  'include_all_of_attributes',
  'include_any_of_attributes',
])

type Params = Record<string, unknown>
type Interceptor = (cfg: { params?: Params }) => { params?: Params }

const tag = (key: string) => (key === CREDS.accessToken ? '' : `${key}:`)

/**
 * A fake NextBillion Live Tracking API that honours ONLY the documented query
 * params of GET /skynet/asset/list and GET /skynet/asset/{id}/location/last.
 * Each API key is its own namespace. Assets listed in `noLocation` have never
 * been tracked, so their last location is a 404.
 */
function fakeNextBillion(
  assets: number,
  opts: {
    perKey?: Record<string, number>
    noLocation?: Set<number>
    /**
     * 'spec' is the documented `data: { list, page }` body. 'no-page' omits
     * `data.page` (so no hasmore); 'legacy-array' sends `data` as a bare array.
     */
    shape?: 'spec' | 'no-page' | 'legacy-array'
  } = {},
) {
  let calls = 0
  const log: Array<{ key: string; path: string; params: Params }> = []

  const get = vi.fn(
    async (path: string, cfg: { params?: Params } | undefined, apply: Interceptor) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      const sent = apply({ params: cfg?.params }).params ?? {}
      const params = Object.fromEntries(Object.entries(sent).filter(([, v]) => v !== undefined))
      const key = String(params.key)
      log.push({ key, path, params })
      const n = opts.perKey?.[key] ?? assets
      const ids = Array.from({ length: n }, (_, i) => `${tag(key)}a${i + 1}`)

      if (path === '/skynet/asset/list') {
        const bad = Object.keys(params).filter((k) => !LIST_KEYS.has(k))
        if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
        const pn = params.pn === undefined ? 1 : Number(params.pn)
        const ps = params.ps === undefined ? 20 : Number(params.ps)
        if (!(ps >= 1 && ps <= MAX)) throw new Error(`400: ps ${ps}`)
        if (!(pn >= 1)) throw new Error(`400: pn ${pn}`)
        const start = (pn - 1) * ps
        const list = ids.slice(start, start + ps).map((id) => ({ id, name: `Asset ${id}` }))
        if (opts.shape === 'legacy-array') return { data: { status: 'Ok', data: list } }
        if (opts.shape === 'no-page') return { data: { status: 'Ok', data: { list } } }
        return {
          data: {
            status: 'Ok',
            data: {
              list,
              page: { total: n, offset: start, page: pn - 1, size: ps, hasmore: start + ps < n },
            },
          },
        }
      }

      const m = /^\/skynet\/asset\/([^/]+)\/location\/last$/.exec(path)
      if (m) {
        const extra = Object.keys(params).filter((k) => k !== 'key')
        if (extra.length) throw new Error(`400: undocumented params ${extra.join(',')}`)
        const idx = ids.indexOf(m[1]!)
        if (idx < 0 || opts.noLocation?.has(idx + 1)) throw new Error('404: no location')
        // The documented body: data.location holds a nested location {lat, lon}
        // and a millisecond timestamp.
        return {
          data: {
            status: 'Ok',
            data: {
              location: { location: { lat: 1, lon: 2 }, timestamp: 1709287200000 },
            },
          },
        }
      }
      throw new Error(`unexpected path ${path}`)
    },
  )

  vi.spyOn(axios, 'create').mockImplementation((() => {
    let interceptor: Interceptor = (c) => c
    return {
      interceptors: { request: { use: (fn: Interceptor) => void (interceptor = fn) } },
      get: (path: string, cfg?: { params?: Params }) => get(path, cfg, interceptor),
      post: vi.fn(),
      delete: vi.fn(),
    }
  }) as never)
  return { get, log, lists: () => log.filter((c) => c.path === '/skynet/asset/list') }
}

const ids = (n: number, prefix = '', skip: Set<number> = new Set()) =>
  Array.from({ length: n }, (_, i) => i + 1)
    .filter((i) => !skip.has(i))
    .map((i) => `${prefix}a${i}`)
const byAsset = (r: { trackingNumber?: string }): string => r.trackingNumber ?? '<no asset>'

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('nextbillion-ai listTrackingEvents paging', () => {
  const adapter = () => new NextBillionAiAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeNextBillion(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listTrackingEvents(CREDS, params)).map(byAsset))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
  })

  it('assets without a location do not shorten a caller page', async () => {
    const skip = new Set([2, 4, 7])
    fakeNextBillion(N + skip.size, { noLocation: skip })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await adapter().listTrackingEvents(CREDS, params)
      if (k < 3) expect(rows).toHaveLength(L)
      seen.push(...rows.map(byAsset))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(N + skip.size, '', skip))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented key (pn)', async () => {
    const { lists } = fakeNextBillion(N)
    // A cold page 2 (no earlier walk to continue from) must still reach upstream page 2.
    await adapter().listTrackingEvents(CREDS, withPageSink({ page: 2, limit: L }))
    const pns = lists().map((c) => c.params.pn)
    expect(pns).toContain(2)
    for (const c of lists()) {
      expect(c.params.ps).toBe(L)
      expect(c.params.limit).toBeUndefined()
    }
  })

  it('a limit above the maximum is clamped and never sends ps above 100', async () => {
    const { lists } = fakeNextBillion(150)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listTrackingEvents(CREDS, params)
    expect(rows.map(byAsset)).toEqual(ids(150))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(lists().length).toBeGreaterThan(1)
    for (const c of lists()) expect(Number(c.params.ps)).toBeLessThanOrEqual(MAX)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeNextBillion(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(
      await adapter().listTrackingEvents(CREDS, params),
      params,
      'nextbillion-ai',
    )
    expect(env.data.map(byAsset)).toEqual(ids(N).slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('one connection walked at two limits serves the right rows at each', async () => {
    fakeNextBillion(20)
    await adapter().listTrackingEvents(CREDS, withPageSink({ page: 1, limit: 5 }))
    const params = withPageSink({ page: 2, limit: 7 })
    const rows = await adapter().listTrackingEvents(CREDS, params)
    expect(rows.map(byAsset)).toEqual(ids(20).slice(7, 14))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('data.page.hasmore=false on a full page ends the walk without another list call', async () => {
    const { lists } = fakeNextBillion(2 * L)
    const seen: string[] = []
    let more: boolean | undefined
    for (let k = 1; k <= 2; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listTrackingEvents(CREDS, params)).map(byAsset))
      more = readUpstreamPage(params)?.hasMore
    }
    expect(seen).toEqual(ids(2 * L))
    expect(more).toBe(false)
    expect(lists().map((c) => c.params.pn)).not.toContain(3)
  })

  for (const shape of ['no-page', 'legacy-array'] as const) {
    it(`without data.page (${shape}) a short page ends the walk`, async () => {
      const { lists } = fakeNextBillion(N, { shape })
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (let k = 1; k <= 3; k++) {
        const params = withPageSink({ page: k, limit: L })
        seen.push(...(await adapter().listTrackingEvents(CREDS, params)).map(byAsset))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(ids(N))
      expect(more).toEqual([true, true, false])
      expect(Math.max(...lists().map((c) => Number(c.params.pn)))).toBeLessThanOrEqual(3)
    })
  }

  it('a second connection never reuses the first connection’s rows', async () => {
    const { log } = fakeNextBillion(N, { perKey: { [OTHER.accessToken]: N } })
    await adapter().listTrackingEvents(CREDS, withPageSink({ page: 1, limit: L }))
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter().listTrackingEvents(OTHER, params)
    expect(rows.map(byAsset)).toEqual(ids(N, `${OTHER.accessToken}:`).slice(L, 2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(log.some((c) => c.key === OTHER.accessToken && c.path === '/skynet/asset/list')).toBe(
      true,
    )
  })
})
