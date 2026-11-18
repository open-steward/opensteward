/**
 * Ship24 list paging. listShipments and listTrackingEvents sent `limit` and no
 * page number (plus an undocumented `cursor`), so page 2 repeated page 1 and no
 * tracker past the first upstream page could be reached. listCarriers returned
 * every courier on every page.
 *
 * First-party spec, https://docs.ship24.com/assets/openapi/ship24-tracking-api.yaml
 * (the spec https://docs.ship24.com/tracking-api-reference/ renders):
 *   GET /public/v1/trackers, "List existing Trackers":
 *     "This endpoint return a list of all existing `Trackers`, using page-based pagination."
 *     page:  "The page index." (minimum 1, default 1)
 *     limit: "The maximum number of trackers returned per page." (default 100, maximum 500)
 *     The response is `data.trackers` only: no total and no next flag, so a
 *     short page is the end.
 *   GET /public/v1/couriers, "Get all couriers":
 *     "This endpoint will return the list of all couriers supported by Ship24"
 *     and takes no paging parameters.
 *
 * Shipments come one per tracker that has a tracking result, and events are
 * flattened out of each tracker's results, so an upstream page of trackers is
 * not a caller page of either: both page by rows. Couriers are sliced locally.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import { Ship24Adapter } from '../../../../../../src/verticals/logistics/adapters/ship24/index'

const CREDS = { accessToken: 'ship24_test_key' }
const OTHER = { accessToken: 'ship24_other_key' }
const CALL_BUDGET = 3000
const L = 5
const N = 2 * L + 1
const MAX = 500
const TRACKER_LIST_KEYS = new Set(['page', 'limit', 'sort'])

type Params = Record<string, unknown>

/**
 * A fake Ship24 Tracking API that honours ONLY the documented query params:
 * page/limit/sort on GET /trackers, none on /trackers/{id}/results or
 * /couriers. Each API key is its own namespace. Trackers listed in
 * `noResults` 404 on their results. `eventsPer(i)` is how many events tracker
 * i (1-based) holds.
 */
function fakeShip24(
  trackers: number,
  opts: {
    perKey?: Record<string, number>
    noResults?: Set<number>
    eventsPer?: (i: number) => number
    couriers?: number
  } = {},
) {
  let calls = 0
  const log: Array<{ key: string; path: string; params: Params }> = []
  const eventsPer = opts.eventsPer ?? (() => 1)

  vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers?: Record<string, string> }) => {
    const key = String(cfg?.headers?.Authorization ?? '').replace(/^Bearer /, '')
    const tag = key === CREDS.accessToken ? '' : `${key}:`
    const n = opts.perKey?.[key] ?? trackers
    const get = vi.fn(async (path: string, c?: { params?: Params }) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      const params = Object.fromEntries(
        Object.entries(c?.params ?? {}).filter(([, v]) => v !== undefined),
      )
      log.push({ key, path, params })

      if (path === 'trackers') {
        const bad = Object.keys(params).filter((k) => !TRACKER_LIST_KEYS.has(k))
        if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
        const page = params.page === undefined ? 1 : Number(params.page)
        const limit = params.limit === undefined ? 100 : Number(params.limit)
        if (!(limit >= 1 && limit <= MAX)) throw new Error(`400: limit ${limit}`)
        if (!(page >= 1)) throw new Error(`400: page ${page}`)
        if (params.sort !== undefined && ![1, -1].includes(Number(params.sort)))
          throw new Error(`400: sort ${String(params.sort)}`)
        const start = (page - 1) * limit
        // The spec's sort: ascending (1) is the default; -1 is newest first.
        const all = Array.from({ length: n }, (_, i) => i + 1)
        if (Number(params.sort) === -1) all.reverse()
        const list = all
          .slice(start, start + limit)
          .map((i) => ({ trackerId: `${tag}t${i}`, trackingNumber: `TN${i}` }))
        return { data: { data: { trackers: list } } }
      }

      const m = /^trackers\/([^/]+)\/results$/.exec(path)
      if (m) {
        if (Object.keys(params).length) throw new Error('400: results takes no query params')
        const i = Number(m[1]!.replace(tag, '').slice(1))
        if (!(i >= 1 && i <= n) || opts.noResults?.has(i)) throw new Error('404: no results')
        const trackerId = `${tag}t${i}`
        const events = Array.from({ length: eventsPer(i) }, (_, j) => ({
          eventId: `${trackerId}e${j + 1}`,
          trackingNumber: `TN${i}`,
          statusMilestone: 'in_transit',
        }))
        return {
          data: {
            data: {
              trackings: [
                {
                  tracker: {
                    trackerId,
                    trackingNumber: `TN${i}`,
                    createdAt: '2026-01-01T00:00:00Z',
                  },
                  shipment: null,
                  events,
                  statistics: null,
                },
              ],
            },
          },
        }
      }

      if (path === 'couriers') {
        if (Object.keys(params).length) throw new Error('400: couriers takes no query params')
        const couriers = Array.from({ length: opts.couriers ?? 0 }, (_, i) => ({
          courierCode: `c${i + 1}`,
          courierName: `Courier ${i + 1}`,
          courierUrl: null,
          courierCountryCode: null,
        }))
        return { data: { data: { couriers } } }
      }
      throw new Error(`unexpected path ${path}`)
    })
    return { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  }) as never)

  return { log, lists: () => log.filter((c) => c.path === 'trackers') }
}

const trackerIds = (n: number, prefix = '', skip: Set<number> = new Set()) =>
  Array.from({ length: n }, (_, i) => i + 1)
    .filter((i) => !skip.has(i))
    .map((i) => `${prefix}t${i}`)
const eventId = (e: { metadata?: Record<string, unknown> }) => String(e.metadata?.eventId)
const adapter = () => new Ship24Adapter()

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe('ship24 listShipments paging', () => {
  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeShip24(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listShipments(CREDS, params)).map((s) => String(s.id)))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(trackerIds(N))
    expect(more).toEqual([true, true, false])
  })

  it('trackers without results do not shorten a caller page', async () => {
    const skip = new Set([2, 4, 7])
    fakeShip24(N + skip.size, { noResults: skip })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await adapter().listShipments(CREDS, params)
      if (k < 3) expect(rows).toHaveLength(L)
      seen.push(...rows.map((s) => String(s.id)))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(trackerIds(N + skip.size, '', skip))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented key (page)', async () => {
    const { lists } = fakeShip24(N)
    await adapter().listShipments(CREDS, withPageSink({ page: 2, limit: L }))
    expect(lists().map((c) => c.params.page)).toContain(2)
    for (const c of lists()) {
      expect(c.params.limit).toBe(L)
      expect(c.params.cursor).toBeUndefined()
    }
  })

  it('a limit above the maximum is clamped and never sends limit above 500', async () => {
    const { lists } = fakeShip24(700)
    const params = withPageSink({ page: 1, limit: 600 })
    const rows = await adapter().listShipments(CREDS, params)
    expect(rows.map((s) => String(s.id))).toEqual(trackerIds(700).slice(0, 600))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(lists().length).toBeGreaterThan(1)
    for (const c of lists()) expect(Number(c.params.limit)).toBeLessThanOrEqual(MAX)
  })

  it('a full last page ends the walk at the empty page after it', async () => {
    fakeShip24(2 * L)
    const seen: string[] = []
    let more: boolean | undefined
    for (let k = 1; k <= 2; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listShipments(CREDS, params)).map((s) => String(s.id)))
      more = readUpstreamPage(params)?.hasMore
    }
    expect(seen).toEqual(trackerIds(2 * L))
    expect(more).toBe(false)
  })

  it('a short last page ends the walk without asking for the page after it', async () => {
    const { lists } = fakeShip24(N)
    for (let k = 1; k <= 3; k++) {
      await adapter().listShipments(CREDS, withPageSink({ page: k, limit: L }))
    }
    expect(Math.max(...lists().map((c) => Number(c.params.page ?? 1)))).toBe(3)
  })

  it('a walk at one limit never positions a walk at another limit', async () => {
    fakeShip24(40)
    for (let k = 1; k <= 2; k++) {
      await adapter().listShipments(CREDS, withPageSink({ page: k, limit: L }))
    }
    const rows = await adapter().listShipments(CREDS, withPageSink({ page: 2, limit: 7 }))
    expect(rows.map((s) => String(s.id))).toEqual(trackerIds(40).slice(7, 14))
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeShip24(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listShipments(CREDS, params), params, 'ship24')
    expect(env.data.map((s) => String(s.id))).toEqual(trackerIds(N).slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('a second connection never reuses the first connection’s rows', async () => {
    const { log } = fakeShip24(N)
    await adapter().listShipments(CREDS, withPageSink({ page: 1, limit: L }))
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter().listShipments(OTHER, params)
    expect(rows.map((s) => String(s.id))).toEqual(
      trackerIds(N, `${OTHER.accessToken}:`).slice(L, 2 * L),
    )
    expect(log.some((c) => c.key === OTHER.accessToken && c.path === 'trackers')).toBe(true)
  })
})

describe('ship24 listTrackingEvents paging', () => {
  // Tracker 1 holds 3 events and every other tracker 1: N events over N-2 trackers.
  const eventsPer = (i: number) => (i === 1 ? 3 : 1)
  const allEvents = (trackers: number, per: (i: number) => number = eventsPer) =>
    Array.from({ length: trackers }, (_, i) => i + 1).flatMap((i) =>
      Array.from({ length: per(i) }, (_, j) => `t${i}e${j + 1}`),
    )

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeShip24(N - 2, { eventsPer })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listTrackingEvents(CREDS, params)).map(eventId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toHaveLength(N)
    expect(seen).toEqual(allEvents(N - 2))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented key (page)', async () => {
    const { lists } = fakeShip24(N, { eventsPer: () => 2 })
    // Two events per tracker: caller page 3 (events 2L..3L-1) lives on upstream page 2.
    await adapter().listTrackingEvents(CREDS, withPageSink({ page: 3, limit: L }))
    expect(lists().map((c) => c.params.page)).toContain(2)
    for (const c of lists()) expect(c.params.cursor).toBeUndefined()
  })

  it('a limit above the maximum is clamped and never sends limit above 500', async () => {
    const { lists } = fakeShip24(700)
    const params = withPageSink({ page: 1, limit: 600 })
    const rows = await adapter().listTrackingEvents(CREDS, params)
    expect(rows.map(eventId)).toEqual(allEvents(700, () => 1).slice(0, 600))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    for (const c of lists()) expect(Number(c.params.limit)).toBeLessThanOrEqual(MAX)
  })

  it('a walk at one limit never positions a walk at another limit', async () => {
    fakeShip24(40)
    for (let k = 1; k <= 2; k++) {
      await adapter().listTrackingEvents(CREDS, withPageSink({ page: k, limit: L }))
    }
    const rows = await adapter().listTrackingEvents(CREDS, withPageSink({ page: 2, limit: 7 }))
    expect(rows.map(eventId)).toEqual(allEvents(40, () => 1).slice(7, 14))
  })

  it('a shipments walk never positions an events walk', async () => {
    fakeShip24(40, { eventsPer: () => 2 })
    for (let k = 1; k <= 3; k++) {
      await adapter().listShipments(CREDS, withPageSink({ page: k, limit: L }))
    }
    const rows = await adapter().listTrackingEvents(CREDS, withPageSink({ page: 3, limit: L }))
    expect(rows.map(eventId)).toEqual(allEvents(40, () => 2).slice(2 * L, 3 * L))
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeShip24(N - 2, { eventsPer })
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listTrackingEvents(CREDS, params), params, 'ship24')
    expect(env.data.map(eventId)).toEqual(allEvents(N - 2).slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })
})

describe('ship24 listCarriers paging', () => {
  const codes = (n: number) => Array.from({ length: n }, (_, i) => `c${i + 1}`)

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeShip24(0, { couriers: N })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listCarriers(CREDS, params)).map((c) => String(c.id)))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(codes(N))
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeShip24(0, { couriers: N })
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listCarriers(CREDS, params), params, 'ship24')
    expect(env.data.map((c) => c.id)).toEqual(codes(N).slice(L, 2 * L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, hasMore: true, totalCount: N }),
    )
  })
})
