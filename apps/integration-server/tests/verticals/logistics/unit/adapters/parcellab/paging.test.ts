/**
 * parcelLab list paging. listOrders, listShipments and listTrackingEvents all
 * read GET /v4/track/orders/ and ignored the caller's `page`: every call sent
 * the same `limit` (and an `offset` the endpoint does not document), so page 2
 * repeated page 1.
 *
 * GET /v4/track/orders/ is cursor-paged. First-party spec,
 * https://docs.parcellab.com/docs/developers/orders/full-order-api-spec.md
 * (operationId track_orders_list, "List Orders"):
 *   {"name":"cursor","required":false,"in":"query","description":"The pagination cursor value."}
 *   PaginatedOrderList: {"next":{"type":"string","nullable":true,"format":"uri"}, ... "results": [...]}
 *
 * No page-size parameter is documented, so the upstream page size is the
 * server's, not the caller's: the adapter pages by rows (pageByRows) over the
 * cursor chain, reading the next cursor out of the `next` URI.
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
import { ParcellabAdapter } from '../../../../../../src/verticals/logistics/adapters/parcellab/index'

const CREDS = { accessToken: 'pl_token', extra: { userId: '1001' } }
const OTHER = { accessToken: 'pl_other', extra: { userId: '2002' } }
const CALL_BUDGET = 60
const L = 5
const N = 2 * L + 1
/** The server's own page size: not one the caller can set. */
const UPSTREAM = 4
const DOCUMENTED = new Set(['account', 'cursor', 'external_reference', 'order_number', 'ordering'])
const BASE = 'https://api.parcellab.com/v4/track/orders/'

const mint = (offset: number, auth: string) =>
  Buffer.from(JSON.stringify({ a: auth, o: offset })).toString('base64')
const unmint = (c: string, auth: string): number => {
  const d = JSON.parse(Buffer.from(c, 'base64').toString()) as { a: string; o: number }
  if (d.a !== auth) throw new Error('400: cursor minted for another connection')
  return d.o
}

/**
 * A fake parcelLab that honours ONLY the documented query params of
 * GET /v4/track/orders/ and pages by its own opaque cursor, returned inside
 * the `next` URI. Each Authorization header is its own account.
 */
function fakeParcellab(orders: number, perAuth: Record<string, number> = {}) {
  let calls = 0
  const log: Array<{ auth: string; path: string; params: Record<string, unknown> }> = []
  const gets = new Map<string, ReturnType<typeof makeGet>>()

  function makeGet(auth: string, n: number, prefix: string) {
    const rows = Array.from({ length: n }, (_, i) => ({
      external_id: `${prefix}o${i + 1}`,
      order_number: `ORD-${i + 1}`,
    }))
    return vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      const params = Object.fromEntries(
        Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
      )
      log.push({ auth, path, params })
      if (path !== 'v4/track/orders/') throw new Error(`unexpected path ${path}`)
      const bad = Object.keys(params).filter((k) => !DOCUMENTED.has(k))
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      const start = params.cursor === undefined ? 0 : unmint(String(params.cursor), auth)
      const more = start + UPSTREAM < rows.length
      return {
        data: {
          next: more ? `${BASE}?cursor=${encodeURIComponent(mint(start + UPSTREAM, auth))}` : null,
          previous: null,
          results: rows.slice(start, start + UPSTREAM),
        },
      }
    })
  }

  const users: Record<string, { n: number; prefix: string }> = {}
  const authOf = (c: { accessToken: string; extra: { userId: string } }) =>
    `Basic ${Buffer.from(`${c.extra.userId}:${c.accessToken}`).toString('base64')}`
  users[authOf(CREDS)] = { n: orders, prefix: '' }
  users[authOf(OTHER)] = { n: perAuth[OTHER.accessToken] ?? orders, prefix: 'x-' }

  const getFor = (auth: string) => {
    let get = gets.get(auth)
    if (!get) {
      const u = users[auth] ?? { n: orders, prefix: '?' }
      gets.set(auth, (get = makeGet(auth, u.n, u.prefix)))
    }
    return get
  }

  vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers: Record<string, string> }) => ({
    get: getFor(cfg.headers.Authorization!),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  })) as never)
  return { get: getFor(authOf(CREDS)), log, otherAuth: authOf(OTHER) }
}

const ids = (n: number, prefix = '') => Array.from({ length: n }, (_, i) => `${prefix}o${i + 1}`)

type Lister = (
  a: ParcellabAdapter,
  c: typeof CREDS,
  p: ReturnType<typeof withPageSink>,
) => Promise<string[]>
const METHODS: Array<[string, Lister]> = [
  ['listOrders', async (a, c, p) => (await a.listOrders(c, p)).map((r) => r.id ?? '<no id>')],
  ['listShipments', async (a, c, p) => (await a.listShipments(c, p)).map((r) => r.id ?? '<no id>')],
  [
    'listTrackingEvents',
    async (a, c, p) =>
      (await a.listTrackingEvents(c, p)).map((r) =>
        String((r.metadata as Record<string, unknown> | undefined)?.external_id ?? '<no id>'),
      ),
  ],
]

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(METHODS)('parcellab %s paging', (_name, list) => {
  const adapter = () => new ParcellabAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeParcellab(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await list(adapter(), CREDS, params)))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented cursor', async () => {
    const { get } = fakeParcellab(N)
    await list(adapter(), CREDS, withPageSink({ page: 1, limit: L }))
    _resetCursorPager()
    get.mockClear()
    // A fresh walk to page 2 must follow the cursor chain past upstream page 1.
    await list(adapter(), CREDS, withPageSink({ page: 2, limit: L }))
    const sent = get.mock.calls.map((c) => (c[1] as { params: Record<string, unknown> }).params)
    expect(sent.length).toBeGreaterThan(1)
    expect(sent[0]!.cursor).toBeUndefined()
    expect(typeof sent[1]!.cursor).toBe('string')
  })

  it('never sends an undocumented paging param (limit, offset)', async () => {
    const { get } = fakeParcellab(N)
    await list(adapter(), CREDS, withPageSink({ page: 2, limit: L }))
    for (const c of get.mock.calls) {
      const p = (c[1] as { params: Record<string, unknown> }).params
      expect(p.limit).toBeUndefined()
      expect(p.offset).toBeUndefined()
    }
  })

  it('a limit above the maximum is clamped and still reaches the end', async () => {
    fakeParcellab(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    expect(await list(adapter(), CREDS, params)).toEqual(ids(N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeParcellab(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await list(adapter(), CREDS, params)
    const env = listPage(
      rows.map((id) => ({ id })),
      params,
      'parcellab',
    )
    expect(env.data.map((r) => r.id)).toEqual(ids(N).slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('a second connection never reuses the first connection’s rows or cursors', async () => {
    const { log, otherAuth } = fakeParcellab(N)
    await list(adapter(), CREDS, withPageSink({ page: 1, limit: L }))
    const params = withPageSink({ page: 2, limit: L })
    const rows = await list(adapter(), OTHER as typeof CREDS, params)
    expect(rows).toEqual(ids(N, 'x-').slice(L, 2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    const mine = log.filter((c) => c.auth === otherAuth)
    expect(mine.length).toBeGreaterThan(0)
    expect(mine[0]!.params.cursor).toBeUndefined()
  })
})

describe('parcellab pager keys', () => {
  const adapter = () => new ParcellabAdapter()
  /** Same parcelLab account as CREDS, different token: a separate connection. */
  const SAME_ACCOUNT = { accessToken: 'pl_rotated', extra: { userId: '1001' } }

  it.each(METHODS)(
    '%s: a second connection to the SAME account never reuses the first one’s rows or cursors',
    async (_name, list) => {
      const { log } = fakeParcellab(N)
      await list(adapter(), CREDS, withPageSink({ page: 1, limit: L }))
      const sameAuth = `Basic ${Buffer.from(`1001:${SAME_ACCOUNT.accessToken}`).toString('base64')}`
      const params = withPageSink({ page: 2, limit: L })
      const rows = await list(adapter(), SAME_ACCOUNT, params)
      // The fake serves unknown connections with the '?' prefix.
      expect(rows).toEqual(ids(N, '?').slice(L, 2 * L))
      const mine = log.filter((c) => c.auth === sameAuth)
      expect(mine.length).toBeGreaterThan(0)
      expect(mine[0]!.params.cursor).toBeUndefined()
    },
  )

  const PAIRS = METHODS.flatMap(([a, la]) =>
    METHODS.filter(([b]) => b !== a).map(([b, lb]) => [a, la, b, lb] as const),
  )
  it.each(PAIRS)(
    '%s then %s on one connection: the second method walks its own collection',
    async (_a, first, _b, second) => {
      const { get } = fakeParcellab(N)
      await first(adapter(), CREDS, withPageSink({ page: 1, limit: L }))
      get.mockClear()
      const params = withPageSink({ page: 2, limit: L })
      expect(await second(adapter(), CREDS, params)).toEqual(ids(N).slice(L, 2 * L))
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
      const sent = get.mock.calls.map((c) => (c[1] as { params: Record<string, unknown> }).params)
      expect(sent[0]!.cursor).toBeUndefined()
    },
  )

  it('a `next` URI with no cursor fails loudly instead of ending the stream', async () => {
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async () => ({
        data: {
          next: `${BASE}?ordering=-created_at`,
          previous: null,
          results: [{ external_id: 'o1', order_number: 'ORD-1' }],
        },
      })),
      put: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
    })) as never)
    await expect(adapter().listOrders(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /carries no cursor/,
    )
  })
})
