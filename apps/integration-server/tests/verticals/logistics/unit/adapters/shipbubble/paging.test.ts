/**
 * Shipbubble list paging. Every list method ignored the caller's `page`, so
 * page 2 repeated page 1 and nothing past the first page could be reached.
 *
 * GET /shipping/labels is paged by page number.
 * https://docs.shipbubble.com/get-started/pagination:
 *   PerPage: "This is the maximum number of records that will be returned after
 *            the request. This can be modified by passing a new value into the
 *            query parameter. Default is 50"
 *   Page:    "This is current `page` to be returned per request. Default: 1"
 * No maximum is documented, and the `pagination` object's examples disagree on
 * what `current` and `total` count, so the adapter asks for the documented
 * default of 50 and treats a short page as the end. listShipments, listLabels
 * and listTrackingEvents (events flattened from each shipment) are cut to the
 * caller's page by pageByRows.
 *
 * GET /shipping/couriers takes no paging parameters and returns a bare array
 * (https://docs.shipbubble.com/api-reference/couriers/view-courier-integrations),
 * so listCarriers slices the whole list with pageLocally.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { ShipbubbleAdapter } from '../../../../../../src/verticals/logistics/adapters/shipbubble/index'

const CREDS = { accessToken: 'sb_sandbox_test' }
const CALL_BUDGET = 60
const L = 5
const N = 2 * L + 1
const VENDOR_DEFAULT_PER_PAGE = 50
const LABEL_KEYS = new Set(['Page', 'PerPage'])

/** Events per shipment: uneven, so a page of shipments is never a page of events. */
const eventsFor = (i: number) => [1, 2, 0, 3][i % 4]!

/**
 * A fake Shipbubble honouring ONLY the documented `Page` / `PerPage` on
 * GET /shipping/labels, and returning every courier on GET /shipping/couriers.
 */
function fakeShipbubble(opts: { labels?: number; couriers?: number }) {
  let calls = 0
  const labels = Array.from({ length: opts.labels ?? 0 }, (_, i) => ({
    order_id: `SB-${i + 1}`,
    status: 'in_transit',
    courier: { name: 'Kwik', tracking_code: `TC${i + 1}` },
    events: Array.from({ length: eventsFor(i) }, (_, c) => ({
      location: 'Lagos',
      message: `SB-${i + 1}.${c + 1}`,
      captured: '2025-01-01T00:00:00Z',
    })),
    date: '2025-01-01T00:00:00Z',
  }))
  const couriers = Array.from({ length: opts.couriers ?? 0 }, (_, i) => ({
    name: `Courier ${i + 1}`,
    service_code: `c${i + 1}`,
  }))
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    const params = Object.fromEntries(
      Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
    )
    if (path === 'shipping/labels') {
      const bad = Object.keys(params).filter((k) => !LABEL_KEYS.has(k))
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      const per = params.PerPage === undefined ? VENDOR_DEFAULT_PER_PAGE : Number(params.PerPage)
      const page = params.Page === undefined ? 1 : Number(params.Page)
      const start = (page - 1) * per
      return {
        data: {
          status: 'success',
          data: { results: labels.slice(start, start + per) },
        },
      }
    }
    if (path === 'shipping/couriers') {
      if (Object.keys(params).length) throw new Error('400: couriers takes no params')
      return { data: { status: 'success', data: couriers } }
    }
    throw new Error(`unexpected path ${path}`)
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({ get, post: vi.fn() })) as never)
  return { get }
}

const eventIds = (): string[] => {
  const out: string[] = []
  for (let i = 0; out.length < N; i++) {
    for (let c = 0; c < eventsFor(i); c++) out.push(`SB-${i + 1}.${c + 1}`)
    if (eventsFor(i) === 0) out.push(`TC${i + 1}`)
  }
  return out.slice(0, N)
}

interface Method {
  name: string
  seed: (n: number) => { labels?: number; couriers?: number }
  /** A seed large enough that page 2 needs a second upstream page. */
  bigSeed: { labels?: number; couriers?: number }
  call: (a: ShipbubbleAdapter, p: QueryParams) => Promise<unknown[]>
  id: (row: unknown) => string
  expected: () => string[]
}

const byId = (r: unknown) => (r as { id: string }).id
const orderIds = () => Array.from({ length: N }, (_, i) => `SB-${i + 1}`)

const LABEL_METHODS: Method[] = [
  {
    name: 'listShipments',
    seed: (n) => ({ labels: n }),
    bigSeed: { labels: 120 },
    call: (a, p) => a.listShipments(CREDS, p),
    id: byId,
    expected: orderIds,
  },
  {
    name: 'listLabels',
    seed: (n) => ({ labels: n }),
    bigSeed: { labels: 120 },
    call: (a, p) => a.listLabels(CREDS, p),
    id: byId,
    expected: orderIds,
  },
  {
    // 7 shipments hold 1+2+0+3+1+2+0 = 9 events plus 2 summary events = 11.
    name: 'listTrackingEvents',
    seed: () => ({ labels: 7 }),
    bigSeed: { labels: 120 },
    call: (a, p) => a.listTrackingEvents(CREDS, p),
    id: (r) => {
      const e = r as { description?: string; trackingNumber: string }
      return e.description ?? e.trackingNumber
    },
    expected: eventIds,
  },
]

const CARRIERS: Method = {
  name: 'listCarriers',
  seed: (n) => ({ couriers: n }),
  bigSeed: { couriers: 120 },
  call: (a, p) => a.listCarriers(CREDS, p),
  id: byId,
  expected: () => Array.from({ length: N }, (_, i) => `c${i + 1}`),
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe.each([...LABEL_METHODS, CARRIERS])('shipbubble $name paging', (m) => {
  const adapter = () => new ShipbubbleAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeShipbubble(m.seed(N))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await m.call(adapter(), params)
      seen.push(...rows.map(m.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(m.expected())
    expect(more).toEqual([true, true, false])
  })

  it('a limit above the maximum is clamped and still serves every row', async () => {
    const { get } = fakeShipbubble(m.seed(N))
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await m.call(adapter(), params)
    expect(rows.map(m.id)).toEqual(m.expected())
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    for (const c of get.mock.calls) {
      const sent = (c[1] as { params?: Record<string, unknown> } | undefined)?.params ?? {}
      if (sent.PerPage !== undefined) expect(sent.PerPage).toBe(VENDOR_DEFAULT_PER_PAGE)
    }
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeShipbubble(m.seed(N))
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await m.call(adapter(), params), params, 'shipbubble')
    expect(env.data.map(m.id)).toEqual(m.expected().slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })
})

describe.each(LABEL_METHODS)('shipbubble $name upstream requests', (m) => {
  it('the page-2 request carries the documented Page key', async () => {
    const { get } = fakeShipbubble(m.bigSeed)
    await m.call(new ShipbubbleAdapter(), withPageSink({ page: 1, limit: 60 }))
    await m.call(new ShipbubbleAdapter(), withPageSink({ page: 2, limit: 60 }))
    const sent = get.mock.calls.map((c) => (c[1] as { params: Record<string, unknown> }).params)
    expect(sent.every((p) => p.PerPage === VENDOR_DEFAULT_PER_PAGE)).toBe(true)
    expect(sent.some((p) => p.Page === 2)).toBe(true)
  })

  it('a full last upstream page is followed by one empty page, then the list ends', async () => {
    const { get } = fakeShipbubble({ labels: VENDOR_DEFAULT_PER_PAGE })
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await m.call(new ShipbubbleAdapter(), params)
    expect(rows.length).toBeGreaterThan(0)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('a short upstream page ends the list without another request', async () => {
    const { get } = fakeShipbubble({ labels: VENDOR_DEFAULT_PER_PAGE + 10 })
    const params = withPageSink({ page: 1, limit: 500 })
    await m.call(new ShipbubbleAdapter(), params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get).toHaveBeenCalledTimes(2)
  })
})

/**
 * Two connections behind one fake: the Authorization header picks the tenant,
 * so each connection's client sees only its own shipments.
 */
function fakeTwoTenants(perTenant: number) {
  const tenant = (prefix: string) =>
    Array.from({ length: perTenant }, (_, i) => ({
      order_id: `${prefix}-${i + 1}`,
      status: 'in_transit',
      courier: { name: 'Kwik', tracking_code: `${prefix}-TC${i + 1}` },
      events: [],
      date: '2025-01-01T00:00:00Z',
    }))
  const data: Record<string, ReturnType<typeof tenant>> = {
    'Bearer key_A': tenant('A'),
    'Bearer key_B': tenant('B'),
  }
  const gets: Record<string, ReturnType<typeof vi.fn>> = {}
  vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers: { Authorization: string } }) => {
    const auth = cfg.headers.Authorization
    const rows = data[auth]
    if (!rows) throw new Error(`unknown auth ${auth}`)
    const get = vi.fn(async (_path: string, c?: { params?: Record<string, unknown> }) => {
      const per = Number(c?.params?.PerPage ?? VENDOR_DEFAULT_PER_PAGE)
      const start = (Number(c?.params?.Page ?? 1) - 1) * per
      return { data: { status: 'success', data: { results: rows.slice(start, start + per) } } }
    })
    gets[auth] = get
    return { get, post: vi.fn() }
  }) as never)
  return gets
}

describe('shipbubble pager slot isolation', () => {
  it('page 2 on connection B is fetched from B, never served from A’s slot', async () => {
    const gets = fakeTwoTenants(30)
    const a = { accessToken: 'key_A' }
    const b = { accessToken: 'key_B' }
    const pageA = await new ShipbubbleAdapter().listShipments(
      a,
      withPageSink({ page: 1, limit: L }),
    )
    expect(pageA.map(byId)).toEqual(['A-1', 'A-2', 'A-3', 'A-4', 'A-5'])
    const pageB = await new ShipbubbleAdapter().listShipments(
      b,
      withPageSink({ page: 2, limit: L }),
    )
    expect(gets['Bearer key_B']).toHaveBeenCalled()
    expect(pageB.map(byId)).toEqual(['B-6', 'B-7', 'B-8', 'B-9', 'B-10'])
  })

  it('listShipments and listLabels keep separate slots on one connection', async () => {
    fakeShipbubble({ labels: 30 })
    await new ShipbubbleAdapter().listShipments(CREDS, withPageSink({ page: 1, limit: L }))
    const labels = await new ShipbubbleAdapter().listLabels(
      CREDS,
      withPageSink({ page: 2, limit: L }),
    )
    expect(labels.map(byId)).toEqual(['SB-6', 'SB-7', 'SB-8', 'SB-9', 'SB-10'])
    for (const l of labels)
      expect(l).toEqual(expect.objectContaining({ shipmentId: l.id, status: 'CREATED' }))

    _resetRowPager()
    await new ShipbubbleAdapter().listLabels(CREDS, withPageSink({ page: 1, limit: L }))
    const shipments = await new ShipbubbleAdapter().listShipments(
      CREDS,
      withPageSink({ page: 2, limit: L }),
    )
    expect(shipments.map(byId)).toEqual(['SB-6', 'SB-7', 'SB-8', 'SB-9', 'SB-10'])
    for (const s of shipments) expect(s).not.toHaveProperty('shipmentId')
  })

  it('a call without a limit serves the adapter default page size', async () => {
    fakeShipbubble({ labels: 30 })
    const rows = await new ShipbubbleAdapter().listShipments(CREDS, withPageSink({ page: 1 }))
    expect(rows).toHaveLength(20)
  })
})
