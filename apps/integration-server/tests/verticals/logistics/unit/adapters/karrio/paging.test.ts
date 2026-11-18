/**
 * Karrio list paging. Five list methods ignored the caller's `page`, so page 2
 * repeated page 1 and nothing past the first page could be reached.
 *
 * First-party docs, https://docs.karrio.io/reference/openapi, "Pagination":
 *   "Karrio utilizes offset-based pagination via the offset and limit
 *   parameters." ... "The limit parameter take a limit on the number of
 *   objects to be returned from 1 to 100."
 *   { "count" : 100 , "next" : "/v1/shipments?limit=25&offset=50" ,
 *     "previous" : "/v1/shipments?limit=25&offset=25" , "results" : [ ... ] }
 *
 * Karrio is self-hosted ("$ curl https://instance.api.com/v1/shipments"), so
 * every request goes to the connection's own instance (credentials.extra.baseUrl).
 *
 * listShipments, listOrders, listManifests and listCarriers (GET /v1/connections,
 * "List carrier connections") are one upstream page per caller page. listTrackingEvents flattens each tracker's events, and listLabels keeps
 * only shipments with a label_url, so both page by rows.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  setDnsResolver,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { KarrioAdapter } from '../../../../../../src/verticals/logistics/adapters/karrio/index'

const HOST = 'https://karrio.acme.example'
const CREDS = { accessToken: 'karrio_test_key', extra: { baseUrl: HOST } }
const PUBLIC_DNS = async () => [{ address: '93.184.216.34' }]
const CALL_BUDGET = 40
const KARRIO_MAX = 100
/** The most rows the fake instance serves per page: a server may cap below the asked limit. */
let serverMax = KARRIO_MAX
const L = 5
const N = 2 * L + 1

/** The documented query params of each list endpoint (API reference). */
const DOCUMENTED: Record<string, Set<string>> = {
  shipments: new Set([
    'limit',
    'offset',
    'address',
    'carrier_name',
    'created_after',
    'created_before',
    'has_manifest',
    'has_tracker',
    'id',
    'keyword',
    'meta_key',
    'meta_value',
    'metadata_key',
    'metadata_value',
    'option_key',
    'option_value',
    'reference',
    'service',
    'status',
    'tracking_number',
  ]),
  orders: new Set(['limit', 'offset']),
  connections: new Set([
    'limit',
    'offset',
    'active',
    'carrier_name',
    'metadata_key',
    'metadata_value',
    'system_only',
  ]),
  manifests: new Set(['limit', 'offset', 'carrier_name', 'created_after', 'created_before']),
  trackers: new Set([
    'limit',
    'offset',
    'carrier_name',
    'created_after',
    'created_before',
    'status',
    'tracking_number',
  ]),
}

/** Events per tracker: uneven, so one tracker page is never one event page. */
const eventsFor = (i: number) => [1, 2, 3][i % 3]!
/** Every third shipment has no label, so one shipment page is never one label page. */
const hasLabel = (i: number) => i % 3 !== 2

interface Seed {
  shipments?: number
  orders?: number
  manifests?: number
  trackers?: number
  connections?: number
}

type Rows = Record<string, Array<Record<string, unknown>>>
interface Body {
  count?: number
  next?: string | null
  previous?: string | null
  results: unknown[]
}

/** One connection's data; `tag` prefixes every id so tenants never collide. */
function seedRows(seed: Seed, tag = ''): Rows {
  return {
    shipments: Array.from({ length: seed.shipments ?? 0 }, (_, i) => ({
      id: `${tag}s${i + 1}`,
      tracking_number: `TN${i + 1}`,
      label_url: hasLabel(i) ? `https://labels.example/s${i + 1}.pdf` : null,
    })),
    orders: Array.from({ length: seed.orders ?? 0 }, (_, i) => ({ id: `${tag}o${i + 1}` })),
    manifests: Array.from({ length: seed.manifests ?? 0 }, (_, i) => ({ id: `${tag}m${i + 1}` })),
    trackers: Array.from({ length: seed.trackers ?? 0 }, (_, i) => ({
      id: `${tag}t${i + 1}`,
      carrier_name: 'ups',
      carrier_id: 'ups-main',
      tracking_number: `TN${i + 1}`,
      test_mode: false,
      status: 'in_transit',
      events: Array.from({ length: eventsFor(i) }, (_, c) => ({
        date: '2025-01-01',
        time: '10:00 AM',
        description: `${tag}t${i + 1}.${c + 1}`,
        code: 'IT',
      })),
    })),
    connections: Array.from({ length: seed.connections ?? 0 }, (_, i) => ({
      id: `${tag}conn_${i + 1}`,
      object_type: 'carrier-connection',
      carrier_name: 'dhl_express',
      display_name: 'DHL Express',
      // Carrier.id is carrier_id, the key shipments, labels and manifests carry.
      carrier_id: `${tag}c${i + 1}`,
      capabilities: ['shipping'],
      is_system: false,
      active: true,
      test_mode: false,
    })),
  }
}

/** Karrio's limit/offset over one connection's rows (DRF LimitOffsetPagination). */
function serve(rows: Rows, path: string, params: Record<string, unknown>): Body {
  const all = rows[path]
  if (!all || !DOCUMENTED[path]) throw new Error(`unexpected path ${path}`)
  const limit = params.limit === undefined ? 100 : Number(params.limit)
  if (!(Number.isInteger(limit) && limit >= 1 && limit <= KARRIO_MAX))
    throw new Error(`400: limit ${limit}`)
  const offset = params.offset === undefined ? 0 : Number(params.offset)
  const results = all.slice(offset, offset + Math.min(limit, serverMax))
  const end = offset + results.length
  return {
    count: all.length,
    next: end < all.length ? `/v1/${path}?limit=${limit}&offset=${end}` : null,
    previous:
      offset > 0 ? `/v1/${path}?limit=${limit}&offset=${Math.max(offset - limit, 0)}` : null,
    results,
  }
}

/**
 * A fake Karrio that honours ONLY the documented params: limit (1..100) and
 * offset. Any other param is ignored, as an undocumented filter would be.
 * `tenants` maps an API key to that connection's rows, routed on the
 * Authorization header the client sends; `shape` rewrites each response body.
 */
function fakeKarrioWith(
  tenants: Record<string, Rows>,
  shape: (b: Body) => Body = (b) => b,
  host: string = HOST,
) {
  let calls = 0
  const get = vi.fn(
    async (path: string, cfg: { params?: Record<string, unknown> } | undefined, token: string) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      return { data: shape(serve(tenants[token]!, path, cfg?.params ?? {})) }
    },
  )
  vi.spyOn(axios, 'create').mockImplementation(((cfg?: {
    baseURL?: string
    headers?: Record<string, unknown>
  }) => {
    if (cfg?.baseURL !== `${host}/v1/`) throw new Error(`unexpected host: ${cfg?.baseURL}`)
    const auth = String(cfg?.headers?.Authorization ?? '')
    const token = Object.keys(tenants).find((t) => auth === `Token ${t}`)
    if (token === undefined) throw new Error(`unknown credentials: ${auth}`)
    return {
      get: (path: string, c?: { params?: Record<string, unknown> }) => get(path, c, token),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    }
  }) as never)
  return { get }
}

function fakeKarrio(seed: Seed, shape?: (b: Body) => Body) {
  return fakeKarrioWith({ [CREDS.accessToken]: seedRows(seed) }, shape)
}

const sentParams = (get: ReturnType<typeof fakeKarrio>['get'], i: number) =>
  (get.mock.calls[i]![1] as { params: Record<string, unknown> }).params

interface Method {
  name: string
  path: string
  seed: (n: number) => Seed
  call: (a: KarrioAdapter, p: QueryParams) => Promise<unknown[]>
  id: (row: unknown) => string
  expected: (n: number) => string[]
  /** Rows per seeded upstream record, at least: sizes the probes below. */
  derived: boolean
}

const idOf = (row: unknown) => (row as { id: string }).id

const eventIds = (n: number): string[] => {
  const out: string[] = []
  for (let i = 0; out.length < n; i++)
    for (let c = 0; c < eventsFor(i); c++) out.push(`t${i + 1}.${c + 1}`)
  return out.slice(0, n)
}
const labelIds = (n: number): string[] => {
  const out: string[] = []
  for (let i = 0; out.length < n; i++) if (hasLabel(i)) out.push(`s${i + 1}`)
  return out
}
const plain = (prefix: string) => (n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

const METHODS: Method[] = [
  {
    name: 'listShipments',
    path: 'shipments',
    seed: (n) => ({ shipments: n }),
    call: (a, p) => a.listShipments(CREDS, p),
    id: idOf,
    expected: plain('s'),
    derived: false,
  },
  {
    name: 'listOrders',
    path: 'orders',
    seed: (n) => ({ orders: n }),
    call: (a, p) => a.listOrders(CREDS, p),
    id: idOf,
    expected: plain('o'),
    derived: false,
  },
  {
    name: 'listManifests',
    path: 'manifests',
    seed: (n) => ({ manifests: n }),
    call: (a, p) => a.listManifests(CREDS, p),
    id: idOf,
    expected: plain('m'),
    derived: false,
  },
  {
    name: 'listCarriers',
    path: 'connections',
    seed: (n) => ({ connections: n }),
    call: (a, p) => a.listCarriers(CREDS, p),
    id: idOf,
    expected: plain('c'),
    derived: false,
  },
  {
    name: 'listTrackingEvents',
    path: 'trackers',
    // Enough trackers for at least n events.
    seed: (n) => ({ trackers: Math.ceil(n / 2) }),
    call: (a, p) => a.listTrackingEvents(CREDS, p),
    id: (row) => (row as { description: string }).description,
    expected: eventIds,
    derived: true,
  },
  {
    name: 'listLabels',
    path: 'shipments',
    // n labels: every third shipment has none.
    seed: (n) => ({ shipments: Math.ceil((n * 3) / 2) }),
    call: (a, p) => a.listLabels(CREDS, p),
    id: idOf,
    expected: labelIds,
    derived: true,
  },
]

/** Seeds exactly `n` rows of the method's resource (derived methods: at least n). */
function exactSeed(m: Method, n: number): Seed {
  if (m.name === 'listTrackingEvents') {
    let trackers = 0
    let events = 0
    while (events < n) events += eventsFor(trackers++)
    return { trackers }
  }
  if (m.name === 'listLabels') {
    let shipments = 0
    let labels = 0
    while (labels < n) if (hasLabel(shipments++)) labels++
    return { shipments }
  }
  return m.seed(n)
}

const adapter = () => new KarrioAdapter()

beforeEach(() => {
  serverMax = KARRIO_MAX
  _resetRowPager()
  vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
  setDnsResolver(PUBLIC_DNS)
})
afterEach(() => {
  setDnsResolver(undefined)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe.each(METHODS)('karrio $name paging', (m) => {
  it('walks N = 2L+1 rows over pages 1..3, each id once and in order, hasMore exact', async () => {
    const seed = exactSeed(m, N)
    fakeKarrio(seed)
    const all = m.expected(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await m.call(adapter(), params)
      seen.push(...rows.map(m.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    // Derived seeds can overshoot N by a few rows (a tracker's last events).
    const total = m.derived ? seen.length : N
    expect(seen).toEqual(m.expected(total).slice(0, total))
    expect(seen.slice(0, N)).toEqual(all)
    expect(new Set(seen).size).toBe(seen.length)
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented offset key', async () => {
    if (!m.derived) {
      const { get } = fakeKarrio(m.seed(N))
      await m.call(adapter(), withPageSink({ page: 2, limit: L }))
      const sent = sentParams(get, get.mock.calls.length - 1)
      expect(sent).toEqual(expect.objectContaining({ limit: L, offset: L }))
      return
    }
    // A derived page 2 past the first upstream page of 100 needs offset=100.
    const { get } = fakeKarrio(m.seed(600))
    const rows = await m.call(adapter(), withPageSink({ page: 2, limit: 150 }))
    expect(rows.map(m.id)).toEqual(m.expected(300).slice(150, 300))
    const offsets = get.mock.calls.map((_, i) => sentParams(get, i).offset)
    expect(offsets).toContain(100)
    for (let i = 0; i < get.mock.calls.length; i++)
      expect(sentParams(get, i).limit).toBeLessThanOrEqual(KARRIO_MAX)
  })

  it('a limit above the documented maximum of 100 is clamped', async () => {
    const { get } = fakeKarrio(m.seed(300))
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await m.call(adapter(), params)
    for (let i = 0; i < get.mock.calls.length; i++)
      expect(sentParams(get, i).limit).toBeLessThanOrEqual(KARRIO_MAX)
    if (m.derived) {
      // Paged by rows: the caller's 500 is served from upstream pages of 100.
      expect(rows.map(m.id)).toEqual(m.expected(300).slice(0, 300).slice(0, rows.length))
      expect(rows.length).toBeGreaterThanOrEqual(300)
      expect(readUpstreamPage(params)).toEqual(expect.objectContaining({ pagedLocally: true }))
    } else {
      expect(rows.map(m.id)).toEqual(m.expected(KARRIO_MAX))
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ hasMore: true, pageSize: KARRIO_MAX, totalCount: 300 }),
      )
      // Page 2 at the clamped size starts where page 1 stopped.
      const p2 = withPageSink({ page: 2, limit: 500 })
      const rows2 = await m.call(adapter(), p2)
      expect(rows2.map(m.id)).toEqual(m.expected(2 * KARRIO_MAX).slice(KARRIO_MAX))
    }
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeKarrio(exactSeed(m, N))
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await m.call(adapter(), params), params, 'karrio')
    expect(env.data.map(m.id)).toEqual(m.expected(N).slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })
})

describe.each(METHODS)('karrio $name end signal and request shape', (m) => {
  it('hasMore follows `next`, not `count`, when the two disagree', async () => {
    // count lies in the opposite direction to next on every page.
    fakeKarrio(exactSeed(m, N), (b) => ({ ...b, count: b.next ? 0 : 1_000_000 }))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await m.call(adapter(), params)).map(m.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen.slice(0, N)).toEqual(m.expected(N))
    expect(more).toEqual([true, true, false])
  })

  it('past one upstream page of 100, `next` still drives the walk when count lies', async () => {
    fakeKarrio(m.seed(600), (b) => ({ ...b, count: b.next ? 0 : 1_000_000 }))
    const size = m.derived ? 150 : KARRIO_MAX
    const params = withPageSink({ page: 2, limit: size })
    const rows = await m.call(adapter(), params)
    expect(rows.map(m.id)).toEqual(m.expected(2 * size).slice(size))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('an empty upstream page ends the walk even when `next` is still set', async () => {
    fakeKarrio(exactSeed(m, N), (b) => ({ ...b, next: '/v1/more' }))
    const params = withPageSink({ page: 50, limit: L })
    expect(await m.call(adapter(), params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a collection of exactly 2L rows ends on page 2', async () => {
    if (m.derived) return // derived seeds cannot land on an exact row count
    fakeKarrio(m.seed(2 * L))
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      await m.call(adapter(), params)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(more).toEqual([true, false])
  })

  it('sends only documented params, and derived methods always ask for 100', async () => {
    const { get } = fakeKarrio(m.seed(300))
    await m.call(adapter(), withPageSink({ page: 2, limit: 7 }))
    expect(get.mock.calls.length).toBeGreaterThan(0)
    for (let i = 0; i < get.mock.calls.length; i++) {
      const sent = sentParams(get, i)
      for (const k of Object.keys(sent))
        expect(DOCUMENTED[m.path]!.has(k), `${k} documented`).toBe(true)
      expect(sent.limit).toBe(m.derived ? KARRIO_MAX : 7)
    }
  })

  it('with no limit, serves the default page of 20', async () => {
    const { get } = fakeKarrio(m.seed(300))
    const rows = await m.call(adapter(), withPageSink({ page: 1 }))
    expect(rows.map(m.id)).toEqual(m.expected(20))
    if (!m.derived) expect(sentParams(get, 0).limit).toBe(20)
  })
})

describe.each(METHODS.filter((m) => m.derived))('karrio $name pager scope', (m) => {
  it('page 2 on connection B comes from B, after connection A walked page 1', async () => {
    const A = { accessToken: 'karrio_key_A', extra: { baseUrl: HOST } }
    const B = { accessToken: 'karrio_key_B', extra: { baseUrl: HOST } }
    const seed = m.seed(300)
    fakeKarrioWith({ [A.accessToken]: seedRows(seed, 'A'), [B.accessToken]: seedRows(seed, 'B') })
    const callAs = (creds: typeof A, p: QueryParams) =>
      m.name === 'listTrackingEvents'
        ? adapter().listTrackingEvents(creds, p)
        : adapter().listLabels(creds, p)
    const a1 = (await callAs(A, withPageSink({ page: 1, limit: L }))).map(m.id)
    const b2 = (await callAs(B, withPageSink({ page: 2, limit: L }))).map(m.id)
    expect(a1).toEqual(m.expected(L).map((id) => `A${id}`))
    expect(b2).toEqual(
      m
        .expected(2 * L)
        .slice(L)
        .map((id) => `B${id}`),
    )
  })
})

describe.each(METHODS.filter((m) => m.derived))('karrio $name pager scope by host', (m) => {
  it('the same API key on another Karrio instance starts its own walk', async () => {
    const OTHER = 'https://karrio.other.example'
    const seed = m.seed(300)
    const onA = { accessToken: 'same_key', extra: { baseUrl: HOST } }
    const onB = { accessToken: 'same_key', extra: { baseUrl: OTHER } }
    const callAs = (creds: typeof onA, p: QueryParams) =>
      m.name === 'listTrackingEvents'
        ? adapter().listTrackingEvents(creds, p)
        : adapter().listLabels(creds, p)
    fakeKarrioWith({ same_key: seedRows(seed, 'A') })
    await callAs(onA, withPageSink({ page: 1, limit: L }))
    vi.restoreAllMocks()
    const { get } = fakeKarrioWith({ same_key: seedRows(seed, 'B') }, undefined, OTHER)
    const b2 = (await callAs(onB, withPageSink({ page: 2, limit: L }))).map(m.id)
    expect(get).toHaveBeenCalled()
    expect(b2).toEqual(
      m
        .expected(2 * L)
        .slice(L)
        .map((id) => `B${id}`),
    )
  })
})

describe.each(METHODS.filter((m) => m.derived))('karrio $name short upstream pages', (m) => {
  it('an upstream page shorter than asked while `next` is set continues from the rows served', async () => {
    // The instance serves 7 rows per page although 100 were asked: the next
    // upstream offset is offset + rows served, not offset + 100.
    serverMax = 7
    fakeKarrio(m.seed(60))
    const seen: string[] = []
    for (const page of [1, 2, 3, 4]) {
      const rows = await m.call(adapter(), withPageSink({ page, limit: 10 }))
      seen.push(...rows.map(m.id))
    }
    expect(seen).toEqual(m.expected(40))
    expect(new Set(seen).size).toBe(40)
  })
})
