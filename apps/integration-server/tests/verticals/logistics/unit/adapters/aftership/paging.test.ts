/**
 * AfterShip list paging. Three list methods ignored the caller's `page`, so
 * page 2 repeated page 1 and nothing past the first page could be reached.
 *
 * GET /trackings (Tracking API, the adapter pins 2024-10) is cursor-paged.
 * First-party docs, https://www.aftership.com/docs/tracking/2025-01/jh865r66gc6hi-get-trackings
 * (2024-10 is no longer served by the docs site; 2025-01 is its oldest):
 *   cursor: "A string representing the cursor value for the current page of results."
 *   limit:  "Number of trackings each page contain. (Default: 100, Max: 200)"
 * AfterShip's own SDK on the 2024-10 branch, src/model/PaginationGetTrackingsResponse.ts:
 *   next_cursor: "A string representing the cursor value for the next page of results."
 *   has_next_page: "To indicate if next page is available."
 *
 * GET /pickups (Shipping API v3) is token-paged.
 * https://www.aftership.com/docs/shipping/x8mxu5wa7m6y3-get-pickups
 *   limit: "Number of records per page"
 *   next_token: "... If 'next_token' is not included or is null, it means
 *   there are no more records to fetch."
 *
 * listShipments and listPickups are one upstream page per caller page
 * (pageByCursor). listTrackingEvents flattens each tracking's checkpoints, so a
 * page of trackings is not a page of events: it pages by rows (pageByRows).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { AfterShipAdapter } from '../../../../../../src/verticals/logistics/adapters/aftership/index'

const CREDS = { accessToken: 'as_test_key' }
const CALL_BUDGET = 40
const L = 5
const N = 2 * L + 1

const TRACKING_KEYS = new Set([
  'cursor',
  'limit',
  'keyword',
  'tracking_numbers',
  'slug',
  'transit_time',
  'origin',
  'destination',
  'tag',
  'created_at_min',
  'created_at_max',
  'updated_at_min',
  'updated_at_max',
  'fields',
  'return_to_sender',
  'courier_destination_country_iso3',
  'shipment_tags',
  'order_id',
])
const TRACKING_MAX = 200
const PICKUP_KEYS = new Set(['status', 'limit', 'created_at_min', 'created_at_max', 'next_token'])

/**
 * Opaque tokens the fake mints; the adapter must hand them back unchanged.
 * Each token is bound to the API key and the page size it was minted under.
 * AfterShip documents neither binding; the fake assumes both, conservatively,
 * so a cursor replayed under another connection or another page size fails
 * loudly instead of silently landing on the wrong rows.
 */
const token = (offset: number, limit: number, key = CREDS.accessToken) =>
  Buffer.from(JSON.stringify({ k: key, o: offset, l: limit })).toString('base64')
const untoken = (t: string, limit: number, key: string): number => {
  const d = JSON.parse(Buffer.from(t, 'base64').toString()) as { k: string; o: number; l: number }
  if (d.k !== key) throw new Error('400: cursor minted for another API key')
  if (d.l !== limit) throw new Error(`400: cursor minted at limit ${d.l}, replayed at ${limit}`)
  return d.o
}

/** Checkpoints per tracking: uneven, so one tracking page is never one event page. */
const checkpointsFor = (i: number) => [1, 2, 0, 3][i % 4]!

interface FakeOpts {
  trackings?: number
  pickups?: number
  /** The last trackings page carries a non-null next_cursor with has_next_page false. */
  staleNextCursor?: boolean
}

/** Row ids for the default connection are bare; another connection's carry its key. */
const tag = (key: string) => (key === CREDS.accessToken ? '' : `${key}:`)

/**
 * A fake AfterShip that honours ONLY the documented query params of each
 * list endpoint, and pages by its own opaque cursor / next_token. Each API
 * key (the `as-api-key` header) is its own account with its own rows:
 * `opts` seeds the default key, `perKey` any other.
 */
function fakeAfterShip(opts: FakeOpts, perKey: Record<string, FakeOpts> = {}) {
  let calls = 0
  const log: Array<{ key: string; path: string; params: Record<string, unknown> }> = []
  const gets = new Map<string, ReturnType<typeof makeGet>>()

  function makeGet(key: string) {
    const o = perKey[key] ?? opts
    const t = tag(key)
    const trackings = Array.from({ length: o.trackings ?? 0 }, (_, i) => ({
      id: `${t}t${i + 1}`,
      tracking_number: `${t}TN${i + 1}`,
      slug: 'usps',
      tag: 'InTransit',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      checkpoints: Array.from({ length: checkpointsFor(i) }, (_, c) => ({
        checkpoint_time: '2025-01-01T00:00:00Z',
        message: `${t}t${i + 1}.${c + 1}`,
        subtag_message: '',
        tag: 'InTransit',
      })),
    }))
    const pickups = Array.from({ length: o.pickups ?? 0 }, (_, i) => ({
      id: `${t}p${i + 1}`,
      status: 'created',
    }))

    return vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      const params = Object.fromEntries(
        Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
      )
      log.push({ key, path, params })
      if (path === 'trackings') {
        const bad = Object.keys(params).filter((k) => !TRACKING_KEYS.has(k))
        if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
        const limit = params.limit === undefined ? 100 : Number(params.limit)
        if (!(limit >= 1 && limit <= TRACKING_MAX)) throw new Error(`400: limit ${limit}`)
        const start = params.cursor === undefined ? 0 : untoken(String(params.cursor), limit, key)
        const rows = trackings.slice(start, start + limit)
        const more = start + limit < trackings.length
        const next = more || o.staleNextCursor ? token(start + limit, limit, key) : null
        return {
          data: {
            data: {
              trackings: rows,
              pagination: { total: trackings.length, next_cursor: next, has_next_page: more },
            },
          },
        }
      }
      if (path === 'pickups') {
        const bad = Object.keys(params).filter((k) => !PICKUP_KEYS.has(k))
        if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
        const limit = params.limit === undefined ? 20 : Number(params.limit)
        const start =
          params.next_token === undefined ? 0 : untoken(String(params.next_token), limit, key)
        const rows = pickups.slice(start, start + limit)
        const more = start + limit < pickups.length
        const next = more ? token(start + limit, limit, key) : null
        return { data: { data: { pickups: rows, next_token: next } } }
      }
      throw new Error(`unexpected path ${path}`)
    })
  }

  const getFor = (key: string) => {
    let get = gets.get(key)
    if (!get) gets.set(key, (get = makeGet(key)))
    return get
  }

  vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers: Record<string, string> }) => ({
    get: getFor(cfg.headers['as-api-key']!),
    post: vi.fn(),
    delete: vi.fn(),
  })) as never)
  return { get: getFor(CREDS.accessToken), log }
}

const eventIds = (n = N): string[] => {
  const out: string[] = []
  for (let i = 0; out.length < n; i++) {
    for (let c = 0; c < checkpointsFor(i); c++) out.push(`t${i + 1}.${c + 1}`)
    if (checkpointsFor(i) === 0) out.push(`TN${i + 1}`)
  }
  return out.slice(0, n)
}

interface Method {
  name: string
  path: string
  pageKey: string
  seed: (n: number) => { trackings?: number; pickups?: number }
  call: (a: AfterShipAdapter, p: QueryParams, creds?: typeof CREDS) => Promise<unknown[]>
  id: (row: unknown) => string
  expected: (n?: number) => string[]
  total: number
  /** A seed holding at least 4L rows (for walks at 2L). */
  bigSeed: { trackings?: number; pickups?: number }
  /** Rows and limit that make the page-2 walk need a second upstream request. */
  keyProbe?: { seed: { trackings?: number; pickups?: number }; limit: number }
}

const byId = (r: unknown) => (r as { id: string }).id

const METHODS: Method[] = [
  {
    name: 'listShipments',
    path: 'trackings',
    pageKey: 'cursor',
    seed: (n) => ({ trackings: n }),
    call: (a, p, c = CREDS) => a.listShipments(c, p),
    id: byId,
    expected: (n = N) => Array.from({ length: n }, (_, i) => `t${i + 1}`),
    total: N,
    bigSeed: { trackings: 25 },
  },
  {
    name: 'listPickups',
    path: 'pickups',
    pageKey: 'next_token',
    seed: (n) => ({ pickups: n }),
    call: (a, p, c = CREDS) => a.listPickups(c, p),
    id: byId,
    expected: (n = N) => Array.from({ length: n }, (_, i) => `p${i + 1}`),
    total: N,
    bigSeed: { pickups: 25 },
  },
  {
    // Seeded with enough trackings to hold exactly N events: 0..6 trackings
    // carry 1+2+0+3+1+2+0 = 9 checkpoints plus 2 summary events = 11.
    name: 'listTrackingEvents',
    path: 'trackings',
    pageKey: 'cursor',
    seed: () => ({ trackings: 7 }),
    call: (a, p, c = CREDS) => a.listTrackingEvents(c, p),
    id: (r) => {
      const e = r as { description?: string; trackingNumber: string }
      return e.description ?? e.trackingNumber
    },
    expected: eventIds,
    total: N,
    // 16 trackings hold 4 x (1+2+1+3) = 28 events.
    bigSeed: { trackings: 16 },
    // 100 trackings (the upstream page) hold 175 events, so events 201..400
    // start on the second upstream page.
    keyProbe: { seed: { trackings: 150 }, limit: 200 },
  },
]

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(METHODS)('aftership $name paging', (m) => {
  const adapter = () => new AfterShipAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeAfterShip(m.seed(N))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await m.call(adapter(), params)
      seen.push(...rows.map(m.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toHaveLength(m.total)
    expect(seen).toEqual(m.expected())
    expect(more).toEqual([true, true, false])
  })

  it(`the page-2 request carries the documented key`, async () => {
    const probe = m.keyProbe ?? { seed: m.seed(N), limit: L }
    const { get } = fakeAfterShip(probe.seed)
    await m.call(adapter(), withPageSink({ page: 1, limit: probe.limit }))
    await m.call(adapter(), withPageSink({ page: 2, limit: probe.limit }))
    const last = get.mock.calls.at(-1)!
    expect(last[0]).toBe(m.path)
    expect(typeof (last[1] as { params: Record<string, unknown> }).params[m.pageKey]).toBe('string')
  })

  it('a limit above the maximum is clamped and still serves every row', async () => {
    const { get } = fakeAfterShip(m.seed(N))
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await m.call(adapter(), params)
    expect(rows.map(m.id)).toEqual(m.expected())
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    // GET /trackings documents "Max: 200"; GET /pickups documents no maximum,
    // so only the router clamp (checked above by every row arriving) applies.
    if (m.path === 'trackings') {
      for (const c of get.mock.calls) {
        const sent = Number((c[1] as { params: Record<string, unknown> }).params.limit)
        expect(sent).toBeLessThanOrEqual(TRACKING_MAX)
      }
    }
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeAfterShip(m.seed(N))
    const p1 = parseListQuery({ page: '1', limit: String(L) })
    await m.call(adapter(), p1)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await m.call(adapter(), params), params, 'aftership')
    expect(env.data.map(m.id)).toEqual(m.expected().slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })
})

describe('aftership cursor-paged sizes', () => {
  it('listShipments above the adapter ceiling reports the size it sent', async () => {
    const { get } = fakeAfterShip({ trackings: 150 })
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await new AfterShipAdapter().listShipments(CREDS, params)
    const sent = Number((get.mock.calls[0]![1] as { params: Record<string, unknown> }).params.limit)
    expect(rows).toHaveLength(sent)
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: true, pageSize: sent }),
    )
  })

  it('an explicit upstream cursor is still honoured for a direct caller', async () => {
    const { get } = fakeAfterShip({ trackings: N })
    const rows = await new AfterShipAdapter().listShipments(CREDS, {
      limit: L,
      cursor: token(L, L),
    })
    expect(rows.map(byId)).toEqual(['t6', 't7', 't8', 't9', 't10'])
    expect((get.mock.calls[0]![1] as { params: Record<string, unknown> }).params.cursor).toBe(
      token(L, L),
    )
  })
})

const OTHER = { accessToken: 'as_other_key' }

describe.each(METHODS)('aftership $name pager keys', (m) => {
  const adapter = () => new AfterShipAdapter()

  it('a second connection never reuses the first connection’s cursor chain', async () => {
    const { log } = fakeAfterShip(m.seed(N), { [OTHER.accessToken]: m.seed(N) })
    await m.call(adapter(), withPageSink({ page: 1, limit: L }), CREDS)
    const params = withPageSink({ page: 2, limit: L })
    const rows = await m.call(adapter(), params, OTHER)
    expect(rows.map(m.id)).toEqual(
      m
        .expected()
        .slice(L, 2 * L)
        .map((id) => `${OTHER.accessToken}:${id}`),
    )
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    // Every request B made went out under B's key, and B walked its own chain.
    const mine = log.filter((c) => c.key === OTHER.accessToken)
    expect(mine.length).toBeGreaterThan(0)
    expect(mine[0]!.params[m.pageKey]).toBeUndefined()
  })

  it('changing limit between pages starts a chain at the new size', async () => {
    fakeAfterShip(m.bigSeed)
    await m.call(adapter(), withPageSink({ page: 1, limit: L }))
    const params = withPageSink({ page: 2, limit: 2 * L })
    const rows = await m.call(adapter(), params)
    expect(rows.map(m.id)).toEqual(m.expected(4 * L).slice(2 * L, 4 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('a direct caller’s upstream cursor is sent as the documented key', async () => {
    const { get } = fakeAfterShip(m.bigSeed)
    await m.call(adapter(), { limit: L, cursor: token(L, L) })
    expect(get.mock.calls).toHaveLength(1)
    const sent = (get.mock.calls[0]![1] as { params: Record<string, unknown> }).params
    expect(sent[m.pageKey]).toBe(token(L, L))
  })
})

describe.each(METHODS.filter((m) => m.path === 'trackings'))(
  'aftership $name end of chain',
  (m) => {
    it('has_next_page false ends the chain even when next_cursor is still set', async () => {
      fakeAfterShip({ ...m.seed(N), staleNextCursor: true })
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (let k = 1; k <= 3; k++) {
        const params = withPageSink({ page: k, limit: L })
        seen.push(...(await m.call(new AfterShipAdapter(), params)).map(m.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(m.expected())
      expect(more).toEqual([true, true, false])
    })
  },
)
