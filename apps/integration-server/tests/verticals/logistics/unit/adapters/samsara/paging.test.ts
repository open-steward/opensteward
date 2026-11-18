/**
 * Samsara list paging. listShipments and listTrackingEvents ignored the
 * caller's `page` and drained up to 20 upstream pages of 512 routes, so page 2
 * repeated page 1.
 *
 * GET /fleet/routes is cursor-paged. First-party reference,
 * https://developers.samsara.com/reference/fetchroutes:
 *   limit: "The limit for how many objects will be in the response. Default and
 *           max for this value is 512 objects."
 *   after: "If specified, this should be the endCursor value from the previous
 *           page of results. When present, this request will return the next
 *           page of results that occur immediately after the previous page of
 *           results."
 *   pagination.hasNextPage: "True if there are more pages of results
 *           immediately available after this endCursor."
 *
 * listShipments maps one route to one shipment, so one upstream page at the
 * caller's limit is one caller page (pageByCursor). listTrackingEvents
 * flattens route stops into events, so it pages by rows (pageByRows) over
 * upstream pages of 512 routes.
 *
 * The default 30-day window is computed on page 1 and carried in the cursor,
 * so every later page of one walk asks for the same startTime/endTime as the
 * page that minted its cursor.
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
import { SamsaraAdapter } from '../../../../../../src/verticals/logistics/adapters/samsara/index'

const CREDS = { accessToken: 'samsara_test_key' }
const OTHER = { accessToken: 'samsara_other_key' }
const CALL_BUDGET = 60
const L = 5
const N = 2 * L + 1
const MAX = 512
const ROUTE_KEYS = new Set(['startTime', 'endTime', 'limit', 'after'])

const cursor = (offset: number, key: string) =>
  Buffer.from(JSON.stringify({ k: key, o: offset })).toString('base64')
const uncursor = (c: string, key: string): number => {
  const d = JSON.parse(Buffer.from(c, 'base64').toString()) as { k: string; o: number }
  if (d.k !== key) throw new Error('400: cursor minted for another API key')
  return d.o
}

const keyOf = (auth: string) => auth.replace(/^Bearer /, '')
const tag = (key: string) => (key === CREDS.accessToken ? '' : `${key}:`)

type Call = { key: string; path: string; params: Record<string, unknown> }

/**
 * A fake Samsara that honours ONLY the documented query params of
 * GET /fleet/routes and pages by its own opaque endCursor. Each API key is
 * its own org. Every route has `stopsPerRoute` stops.
 */
function fakeSamsara(
  routes: number,
  stopsPerRoute = 1,
  perKey: Record<string, number> = {},
  // The spec says endCursor "may be an empty string if there are no more pages
  // left" -- may, not must. With this set, the last page still carries a
  // non-empty endCursor and only hasNextPage says the walk is over.
  opts: { endCursorOnLastPage?: boolean } = {},
) {
  let calls = 0
  const log: Call[] = []
  const gets = new Map<string, ReturnType<typeof makeGet>>()

  function makeGet(key: string) {
    const n = perKey[key] ?? routes
    const rows = Array.from({ length: n }, (_, i) => ({
      id: `${tag(key)}r${i + 1}`,
      name: `Route ${i + 1}`,
      state: 'unstarted',
      stops: Array.from({ length: stopsPerRoute }, (_, s) => ({
        id: `${tag(key)}r${i + 1}s${s + 1}`,
        name: `Stop ${s + 1}`,
        state: 'unvisited',
      })),
    }))
    return vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      // Time moves between requests, so a window recomputed per page would differ.
      vi.setSystemTime(Date.now() + 100)
      const params = Object.fromEntries(
        Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
      )
      log.push({ key, path, params })
      if (path !== '/fleet/routes') throw new Error(`unexpected path ${path}`)
      const bad = Object.keys(params).filter((k) => !ROUTE_KEYS.has(k))
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      if (!params.startTime || !params.endTime) throw new Error('400: startTime/endTime required')
      const size = params.limit === undefined ? MAX : Number(params.limit)
      if (!(size >= 1 && size <= MAX)) throw new Error(`400: limit ${size}`)
      const start = params.after === undefined ? 0 : uncursor(String(params.after), key)
      const page = rows.slice(start, start + size)
      const more = start + size < rows.length
      return {
        data: {
          data: page,
          pagination: {
            endCursor:
              more || opts.endCursorOnLastPage
                ? cursor(Math.min(start + size, rows.length), key)
                : '',
            hasNextPage: more,
          },
        },
      }
    })
  }

  const getFor = (key: string) => {
    let get = gets.get(key)
    if (!get) gets.set(key, (get = makeGet(key)))
    return get
  }

  vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers: Record<string, string> }) => ({
    get: getFor(keyOf(cfg.headers.Authorization!)),
    post: vi.fn(),
    patch: vi.fn(),
    defaults: { headers: { common: {} } },
  })) as never)
  return { get: getFor(CREDS.accessToken), log }
}

const routeIds = (n: number, prefix = '') =>
  Array.from({ length: n }, (_, i) => `${prefix}r${i + 1}`)
const byId = (r: { id?: string }): string => r.id ?? '<no id>'
const stopId = (e: { metadata?: Record<string, unknown> }): string =>
  ((e.metadata?.stop as { id?: string } | undefined)?.id ?? '<no stop>') as string

beforeEach(() => {
  _resetCursorPager()
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('samsara listShipments paging', () => {
  const adapter = () => new SamsaraAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeSamsara(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listShipments(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(routeIds(N))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented `after` key and page 1’s window', async () => {
    const { get } = fakeSamsara(N)
    await adapter().listShipments(CREDS, withPageSink({ page: 1, limit: L }))
    await adapter().listShipments(CREDS, withPageSink({ page: 2, limit: L }))
    const first = (get.mock.calls[0]![1] as { params: Record<string, unknown> }).params
    const last = (get.mock.calls.at(-1)![1] as { params: Record<string, unknown> }).params
    expect(get.mock.calls.at(-1)![0]).toBe('/fleet/routes')
    expect(typeof last.after).toBe('string')
    expect(last.limit).toBe(L)
    expect(last.startTime).toBe(first.startTime)
    expect(last.endTime).toBe(first.endTime)
  })

  it('a limit above the maximum is sent as exactly 512 and reported as the page size', async () => {
    const { get } = fakeSamsara(N)
    const params = withPageSink({ page: 1, limit: 100000 })
    const rows = await adapter().listShipments(CREDS, params)
    expect(rows.map(byId)).toEqual(routeIds(N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
    expect(get.mock.calls.length).toBeGreaterThan(0)
    for (const c of get.mock.calls) {
      expect((c[1] as { params: Record<string, unknown> }).params.limit).toBe(MAX)
    }
  })

  it('a limit within the maximum reports no page size of its own', async () => {
    fakeSamsara(N)
    const params = withPageSink({ page: 1, limit: L })
    await adapter().listShipments(CREDS, params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('with no caller limit, sends the default of 100', async () => {
    const { get } = fakeSamsara(N)
    await adapter().listShipments(CREDS, withPageSink({ page: 1 }))
    expect((get.mock.calls[0]![1] as { params: Record<string, unknown> }).params.limit).toBe(100)
  })

  it('a cursor minted at one limit is never reused at another limit', async () => {
    fakeSamsara(N)
    await adapter().listShipments(CREDS, withPageSink({ page: 1, limit: L }))
    await adapter().listShipments(CREDS, withPageSink({ page: 2, limit: L }))
    const rows = await adapter().listShipments(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map(byId)).toEqual(routeIds(N).slice(3, 6))
  })

  it('hasNextPage false ends the walk even when the last page carries an endCursor', async () => {
    fakeSamsara(N, 1, {}, { endCursorOnLastPage: true })
    const params = withPageSink({ page: 3, limit: L })
    const rows = await adapter().listShipments(CREDS, params)
    expect(rows.map(byId)).toEqual(routeIds(N).slice(2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeSamsara(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listShipments(CREDS, params), params, 'samsara')
    expect(env.data.map(byId)).toEqual(routeIds(N).slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('a second connection never reuses the first connection’s cursors', async () => {
    const { log } = fakeSamsara(N)
    await adapter().listShipments(CREDS, withPageSink({ page: 1, limit: L }))
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter().listShipments(OTHER, params)
    expect(rows.map(byId)).toEqual(routeIds(N, `${OTHER.accessToken}:`).slice(L, 2 * L))
    const mine = log.filter((c) => c.key === OTHER.accessToken)
    expect(mine[0]!.params.after).toBeUndefined()
  })
})

describe('samsara listTrackingEvents paging', () => {
  const adapter = () => new SamsaraAdapter()
  // 2 stops per route: 6 routes flatten into 12 events.
  const stopIds = (routes: number) =>
    Array.from({ length: routes }, (_, i) => [`r${i + 1}s1`, `r${i + 1}s2`]).flat()

  it('N = 2L+1 rows: pages 1..3 at limit L return every event once, in order, with exact hasMore', async () => {
    // 11 routes of 1 stop each = exactly N events.
    fakeSamsara(N, 1)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listTrackingEvents(CREDS, params)).map(stopId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `r${i + 1}s1`))
    expect(more).toEqual([true, true, false])
  })

  it('flattened stops are cut exactly at the caller’s page boundaries', async () => {
    fakeSamsara(6, 2)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listTrackingEvents(CREDS, params)).map(stopId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(stopIds(6))
    expect(more).toEqual([true, true, false])
  })

  it('walks past the first upstream page of 512 routes, carrying `after` and the window', async () => {
    const { get } = fakeSamsara(MAX + 3, 1)
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await adapter().listTrackingEvents(CREDS, params)
    expect(rows.map(stopId)).toEqual(
      Array.from({ length: MAX + 3 - 500 }, (_, i) => `r${501 + i}s1`),
    )
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    const calls = get.mock.calls.map((c) => (c[1] as { params: Record<string, unknown> }).params)
    expect(calls.length).toBe(2)
    expect(calls[1]!.after).toEqual(expect.any(String))
    expect(calls[1]!.startTime).toBe(calls[0]!.startTime)
    expect(calls[1]!.endTime).toBe(calls[0]!.endTime)
    for (const p of calls) expect(p.limit).toBe(MAX)
  })

  it('a second connection is never served the first connection’s cached events', async () => {
    const { log } = fakeSamsara(6, 2)
    await adapter().listTrackingEvents(CREDS, withPageSink({ page: 1, limit: L }))
    const prefix = `${OTHER.accessToken}:`
    // Page 1 is always read afresh, so the leak a shared key would open is a
    // page 2 served from the upstream page the FIRST connection just fetched.
    const leak = await adapter().listTrackingEvents(OTHER, withPageSink({ page: 2, limit: L }))
    expect(leak.map(stopId)).toEqual(
      stopIds(6)
        .slice(L, 2 * L)
        .map((s) => `${prefix}${s}`),
    )
    _resetCursorPager()
    const other: string[] = []
    for (let k = 1; k <= 2; k++) {
      other.push(
        ...(await adapter().listTrackingEvents(OTHER, withPageSink({ page: k, limit: L }))).map(
          stopId,
        ),
      )
    }
    expect(other).toEqual(
      stopIds(6)
        .slice(0, 2 * L)
        .map((s) => `${prefix}${s}`),
    )
    expect(log.filter((c) => c.key === OTHER.accessToken).length).toBeGreaterThan(0)
  })

  it('hasNextPage false ends the walk even when the last page carries an endCursor', async () => {
    fakeSamsara(6, 2, {}, { endCursorOnLastPage: true })
    const params = withPageSink({ page: 3, limit: L })
    const rows = await adapter().listTrackingEvents(CREDS, params)
    expect(rows.map(stopId)).toEqual(stopIds(6).slice(2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeSamsara(6, 2)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listTrackingEvents(CREDS, params), params, 'samsara')
    expect(env.data.map(stopId)).toEqual(stopIds(6).slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })
})
