/**
 * Nova Poshta (Nova Post) list paging. listShipments, listWarehouses and
 * listTrackingEvents sent an undocumented `offset` taken from `params.cursor`
 * and ignored the caller's `page`, so page 2 repeated page 1.
 *
 * GET /shipments and GET /divisions are page-numbered. First-party spec
 * (OpenAPI embedded in the GitBook pages):
 *   https://api-portal.novapost.com/methods/methods/shipments.md
 *     limit: "Max number of items to return on page." (default 15)
 *     page:  "Number of page to return."
 *   https://api-portal.novapost.com/methods/methods/dictionaries.md (GET /divisions)
 *     limit: "Max number of items to return." (default 15)
 *     page:  "Page number to return."
 *   Both answer with current_page ("Current page."), last_page ("Total pages
 *   found."), per_page ("Current objects` limit for a single page."), total
 *   ("Total objects found.") and items.
 *
 * listTrackingEvents flattens events out of pages of shipments, so it pages
 * by rows (pageByRows) over the page-number chain at a fixed upstream size.
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
import { NovaPoshtaAdapter } from '../../../../../../src/verticals/logistics/adapters/nova-poshta/index'

const CREDS = { accessToken: 'jwt-a', refreshToken: 'np_key_a' }
const OTHER = { accessToken: 'jwt-b', refreshToken: 'np_key_b' }
const CALL_BUDGET = 60
const L = 5
const N = 2 * L + 1
/** The adapter's own clamp (constants.ts); Nova Post documents no maximum. */
const CLAMP = 100
const PAGE_KEYS = new Set(['limit', 'page'])

type Row = Record<string, unknown>

/**
 * A fake Nova Post that honours ONLY the documented `limit` and `page` of
 * GET /shipments and GET /divisions, and answers with the documented
 * page-number envelope. Each JWT is its own client. `serverMax`, when set,
 * silently caps `limit` the way a platform may, and says so in `per_page`.
 */
function fakeNovaPost(
  count: number,
  opts: { perToken?: Record<string, number>; serverMax?: number } = {},
) {
  let calls = 0
  const log: Array<{ token: string; path: string; params: Record<string, unknown> }> = []
  const gets = new Map<string, ReturnType<typeof makeGet>>()

  function rowsFor(token: string, path: string): Row[] {
    const n = opts.perToken?.[token] ?? count
    const tag = token === CREDS.accessToken ? '' : `${token}:`
    if (path === 'shipments')
      return Array.from({ length: n }, (_, i) => ({
        id: `${tag}s${i + 1}`,
        number: `ABCD${String(i + 1).padStart(10, '0')}`,
        status: 'Accepted',
        createdAt: '2026-01-01T00:00:00Z',
      }))
    return Array.from({ length: n }, (_, i) => ({
      id: `${tag}w${i + 1}`,
      name: `Division ${i + 1}`,
    }))
  }

  function makeGet(token: string) {
    return vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      const params = Object.fromEntries(
        Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
      )
      log.push({ token, path, params })
      if (path !== 'shipments' && path !== 'divisions') throw new Error(`unexpected path ${path}`)
      const bad = Object.keys(params).filter((k) => !PAGE_KEYS.has(k))
      if (bad.length) throw new Error(`422: undocumented params ${bad.join(',')}`)
      const asked = params.limit === undefined ? 15 : Number(params.limit)
      const perPage = opts.serverMax ? Math.min(asked, opts.serverMax) : asked
      const page = params.page === undefined ? 1 : Number(params.page)
      const rows = rowsFor(token, path)
      const lastPage = Math.max(1, Math.ceil(rows.length / perPage))
      const items = rows.slice((page - 1) * perPage, page * perPage)
      return {
        data: {
          current_page: page,
          last_page: lastPage,
          per_page: perPage,
          total: rows.length,
          items,
        },
      }
    })
  }

  const getFor = (token: string) => {
    let get = gets.get(token)
    if (!get) gets.set(token, (get = makeGet(token)))
    return get
  }

  vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers: Record<string, string> }) => ({
    get: getFor(cfg.headers.Authorization!),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  })) as never)
  return { get: getFor(CREDS.accessToken), log }
}

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
const byId = (r: { id?: string }): string => r.id ?? '<no id>'
const byShipment = (r: { shipmentId?: string }): string => r.shipmentId ?? '<no shipment>'
const sentParams = (c: unknown[]) => (c[1] as { params: Record<string, unknown> }).params

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

const adapter = () => new NovaPoshtaAdapter()

const PAGE_NUMBERED = [
  {
    method: 'listShipments' as const,
    path: 'shipments',
    prefix: 's',
    call: (c: typeof CREDS, p: Parameters<NovaPoshtaAdapter['listShipments']>[1]) =>
      adapter().listShipments(c, p),
  },
  {
    method: 'listWarehouses' as const,
    path: 'divisions',
    prefix: 'w',
    call: (c: typeof CREDS, p: Parameters<NovaPoshtaAdapter['listWarehouses']>[1]) =>
      adapter().listWarehouses(c, p),
  },
]

for (const m of PAGE_NUMBERED) {
  describe(`nova-poshta ${m.method} paging (GET /${m.path})`, () => {
    it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
      fakeNovaPost(N)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (let k = 1; k <= 3; k++) {
        const params = withPageSink({ page: k, limit: L })
        seen.push(...(await m.call(CREDS, params)).map(byId))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(ids(m.prefix, N))
      expect(more).toEqual([true, true, false])
    })

    it('N = 2L (an exact multiple): the full last page reports hasMore false from last_page, with totalCount', async () => {
      fakeNovaPost(2 * L)
      const seen: string[] = []
      const reports: Array<ReturnType<typeof readUpstreamPage>> = []
      for (let k = 1; k <= 2; k++) {
        const params = withPageSink({ page: k, limit: L })
        seen.push(...(await m.call(CREDS, params)).map(byId))
        reports.push(readUpstreamPage(params))
      }
      expect(seen).toEqual(ids(m.prefix, 2 * L))
      expect(reports.map((r) => r?.hasMore)).toEqual([true, false])
      expect(reports.map((r) => r?.totalCount)).toEqual([2 * L, 2 * L])
    })

    it('the page-2 request carries the documented `page` key and the caller’s limit', async () => {
      const { get } = fakeNovaPost(N)
      await m.call(CREDS, withPageSink({ page: 2, limit: L }))
      const last = get.mock.calls.at(-1)!
      expect(last[0]).toBe(m.path)
      expect(sentParams(last)).toEqual({ page: 2, limit: L })
    })

    it('a limit above the adapter’s clamp is clamped, and the size it paged by is reported', async () => {
      const { get } = fakeNovaPost(250)
      const params = parseListQuery({ page: '2', limit: '100000' })
      const rows = await m.call(CREDS, params)
      expect(sentParams(get.mock.calls.at(-1)!)).toEqual({ page: 2, limit: CLAMP })
      expect(rows.map(byId)).toEqual(ids(m.prefix, 250).slice(CLAMP, 2 * CLAMP))
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ hasMore: true, pageSize: CLAMP }),
      )
    })

    it('a platform that pages by a smaller per_page than asked reports that size', async () => {
      fakeNovaPost(N, { serverMax: 3 })
      const params = withPageSink({ page: 1, limit: L })
      const rows = await m.call(CREDS, params)
      expect(rows.map(byId)).toEqual(ids(m.prefix, 3))
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ hasMore: true, pageSize: 3 }),
      )
    })

    it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
      fakeNovaPost(N)
      const params = parseListQuery({ page: '2', limit: String(L) })
      const env = listPage(await m.call(CREDS, params), params, 'nova-poshta')
      expect(env.data.map(byId)).toEqual(ids(m.prefix, N).slice(L, 2 * L))
      expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
    })
  })
}

describe('nova-poshta listTrackingEvents paging (events flattened from GET /shipments)', () => {
  it('N = 2L+1 rows: pages 1..3 at limit L return every event once, in order, with exact hasMore', async () => {
    const { get } = fakeNovaPost(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listTrackingEvents(CREDS, params)).map(byShipment))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids('s', N))
    expect(more).toEqual([true, true, false])
    // The rows walk asks upstream at one fixed size, not the caller's small limit.
    for (const c of get.mock.calls) expect(sentParams(c).limit).toBe(CLAMP)
  })

  it('walks past the first upstream page of shipments, whose `page` key moves', async () => {
    const { get } = fakeNovaPost(250)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 2; k++) {
      const params = withPageSink({ page: k, limit: 125 })
      seen.push(...(await adapter().listTrackingEvents(CREDS, params)).map(byShipment))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids('s', 250))
    expect(more).toEqual([true, false])
    const pages = get.mock.calls.map((c) => sentParams(c).page)
    expect(pages).toContain(2)
    expect(pages).toContain(3)
  })

  it('stops the walk on last_page: an exact multiple of the upstream size makes no extra empty request', async () => {
    const { get } = fakeNovaPost(2 * CLAMP)
    const params = withPageSink({ page: 1, limit: 2 * CLAMP })
    const rows = await adapter().listTrackingEvents(CREDS, params)
    expect(rows.map(byShipment)).toEqual(ids('s', 2 * CLAMP))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get.mock.calls.map((c) => sentParams(c))).toEqual([
      { page: 1, limit: CLAMP },
      { page: 2, limit: CLAMP },
    ])
  })

  it('a limit above the clamp never sends limit above it and serves every event', async () => {
    const { get } = fakeNovaPost(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    const rows = await adapter().listTrackingEvents(CREDS, params)
    expect(rows.map(byShipment)).toEqual(ids('s', N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    for (const c of get.mock.calls) expect(Number(sentParams(c).limit)).toBeLessThanOrEqual(CLAMP)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeNovaPost(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listTrackingEvents(CREDS, params), params, 'nova-poshta')
    expect(env.data.map(byShipment)).toEqual(ids('s', N).slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('a second connection never reuses the first connection’s rows', async () => {
    const { log } = fakeNovaPost(N, { perToken: { [OTHER.accessToken]: N } })
    await adapter().listTrackingEvents(CREDS, withPageSink({ page: 1, limit: L }))
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter().listTrackingEvents(OTHER, params)
    expect(rows.map(byShipment)).toEqual(ids(`${OTHER.accessToken}:s`, N).slice(L, 2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(log.filter((c) => c.token === OTHER.accessToken).length).toBeGreaterThan(0)
  })
})
