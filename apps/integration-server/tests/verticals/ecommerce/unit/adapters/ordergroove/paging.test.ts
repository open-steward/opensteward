/**
 * Ordergroove list paging: the caller's 1-based `page` + `limit` → a walk of
 * Ordergroove's cursor chain at `page_size = limit`.
 *
 * From https://developer.ordergroove.com/reference/pagination:
 *
 *   "When there are more results than the page_size limit, the response
 *    includes next and previous attributes, which contain URLs with a cursor
 *    parameter for fetching subsequent or previous pages."
 *   "To use cursor-based pagination, include the following header in your
 *    request" — `"X-OG-API-VERSION": "2"`
 *   "By default, List endpoints return 10 results per response" … "up to a
 *    maximum of 100 results."
 *   "Cursor-based pagination does not provide the count attribute in the
 *    response."
 *
 * The page's example `next` URL carries `cursor` and the filters, but not
 * `page_size` — so the size has to be re-sent on every page.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { OrdergrooveAdapter } from '../../../../../../src/verticals/ecommerce/adapters/ordergroove/index'

const CREDS: Credentials = { accessToken: 'ogk_live_abc123' }
const BASE = 'https://restapi.ordergroove.com'
/** Documented: "up to a maximum of 100 results". */
const MAX = 100
/** Documented: "By default, List endpoints return 10 results per response". */
const DEFAULT = 10

type Method = 'listProducts' | 'listCustomers' | 'listOrders'

const CASES: Array<{ method: Method; path: string; row: (i: number) => Record<string, unknown> }> =
  [
    {
      method: 'listProducts',
      path: '/products/',
      row: (i) => ({ external_product_id: `p${i}`, name: `Product ${i}` }),
    },
    {
      method: 'listCustomers',
      path: '/customers/',
      row: (i) => ({ merchant_user_id: `u${i}`, email: `u${i}@example.test` }),
    },
    {
      method: 'listOrders',
      path: '/orders/',
      row: (i) => ({ public_id: `o${i}` }),
    },
  ]

type Row = (i: number) => Record<string, unknown>

interface Sent {
  path: string
  params: Record<string, unknown>
  headers: Record<string, unknown>
}

/**
 * A fake Ordergroove honouring ONLY what the pagination page documents:
 * `page_size` (default 10, max 100 — anything above is refused rather than
 * silently corrected), the opaque `cursor` from a previous `next`, and the
 * `X-OG-API-VERSION: 2` header that switches cursor mode on. Without that
 * header it answers in the legacy mode, whose `next` is a `?page=N` URL this
 * fake does not honour — so an adapter that forgets the header is stuck on
 * page 1, exactly as a missing header would leave it.
 */
/** The fake's opaque cursor: the list it belongs to and a row position. */
function cursorFor(path: string, at: number): string {
  return Buffer.from(`${path}|p=${at}`).toString('base64')
}

function fakeOrdergroove(path: string, total: number, row: Row) {
  return fakeRoutes({ [path]: { total, row } })
}

/** The same fake, serving several list paths at once. */
function fakeRoutes(routes: Record<string, { total: number; row: Row }>) {
  const sent: Sent[] = []
  const get = vi.fn(
    async (
      p: string,
      config?: { params?: Record<string, unknown>; headers?: Record<string, unknown> },
    ) => {
      const params = config?.params ?? {}
      const headers = config?.headers ?? {}
      sent.push({ path: p, params, headers })
      const route = routes[p]
      if (!route) throw new Error(`unexpected path ${p}`)
      const path = p
      const total = route.total
      const rows = Array.from({ length: total }, (_, i) => route.row(i + 1))
      const size = params['page_size'] === undefined ? DEFAULT : Number(params['page_size'])
      if (!Number.isInteger(size) || size < 1 || size > MAX) {
        throw Object.assign(new Error(`page_size ${String(params['page_size'])} out of range`), {
          response: { status: 400 },
        })
      }
      const cursorMode = String(headers['X-OG-API-VERSION'] ?? '') === '2'
      if (!cursorMode) {
        const results = rows.slice(0, size)
        const next = total > size ? `${BASE}${path}?page=2` : null
        return { data: { count: total, next, previous: null, results } }
      }
      const raw = params['cursor']
      let start = 0
      if (raw !== undefined) {
        // An opaque cursor belongs to the list that minted it.
        const [mintedFor, at] = Buffer.from(String(raw), 'base64').toString('utf8').split('|p=')
        if (mintedFor !== path) {
          throw Object.assign(new Error(`cursor for ${mintedFor} sent to ${path}`), {
            response: { status: 400 },
          })
        }
        start = Number(at)
      }
      const results = rows.slice(start, start + size)
      const end = start + results.length
      const filters = new URLSearchParams()
      if (params['updated_start'] !== undefined)
        filters.set('updated_start', String(params['updated_start']))
      const next =
        end < total
          ? `${BASE}${path}?cursor=${encodeURIComponent(cursorFor(path, end))}${
              filters.size ? `&${filters.toString()}` : ''
            }`
          : null
      return { data: { next, previous: null, results } }
    },
  )
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { sent, get }
}

function ids(rows: Array<{ id: string }>): string[] {
  return rows.map((r) => r.id)
}

async function call(method: Method, params: QueryParams, creds: Credentials = CREDS) {
  const adapter = new OrdergrooveAdapter()
  return (await adapter[method](creds, params)) as Array<{ id: string }>
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(CASES)('Ordergroove $method paging', ({ method, path, row }) => {
  const L = 4
  const N = 2 * L + 1

  it('pages 1..3 at limit L serve every row once, in order, with exact hasMore', async () => {
    fakeOrdergroove(path, N, row)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(method, params)
      seen.push(...ids(rows))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    const expected = Array.from({ length: N }, (_, i) =>
      String(row(i + 1)[Object.keys(row(1))[0]!]),
    )
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('page 2 carries the cursor from page 1 next URL, the header, and page_size', async () => {
    const { sent } = fakeOrdergroove(path, N, row)
    await call(method, withPageSink({ page: 1, limit: L }))
    await call(method, withPageSink({ page: 2, limit: L }))
    expect(sent).toHaveLength(2)
    expect(sent[0]!.params['cursor']).toBeUndefined()
    expect(sent[1]!.params['cursor']).toBe(cursorFor(path, L))
    expect(sent[1]!.params['page_size']).toBe(L)
    expect(sent[1]!.headers['X-OG-API-VERSION']).toBe('2')
  })

  it('a page reached cold walks the chain from page 1', async () => {
    fakeOrdergroove(path, N, row)
    const params = withPageSink({ page: 3, limit: L })
    const rows = await call(method, params)
    expect(rows).toHaveLength(1)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a limit above 100 is clamped to 100 and still serves every row', async () => {
    const total = 2 * MAX + 1
    const { sent } = fakeOrdergroove(path, total, row)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 500 })
      seen.push(...ids(await call(method, params)))
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(sent.every((s) => s.params['page_size'] === MAX)).toBe(true)
    expect(new Set(seen).size).toBe(total)
    expect(seen).toHaveLength(total)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    fakeOrdergroove(path, N, row)
    const adapter = new OrdergrooveAdapter()
    const p1 = parseListQuery({ limit: String(L) }, adapter)
    const env1 = listPage(await call(method, p1), p1, 'ordergroove')
    expect(env1.data).toHaveLength(L)
    expect(env1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: String(L), page: '3' }, adapter)
    const env3 = listPage(await call(method, p3), p3, 'ordergroove')
    expect(env3.data).toHaveLength(1)
    expect(env3.meta.hasMore).toBe(false)
  })

  it('two connections do not share a walk', async () => {
    const { sent } = fakeOrdergroove(path, N, row)
    await call(method, withPageSink({ page: 1, limit: L }))
    await call(method, withPageSink({ page: 2, limit: L }), { accessToken: 'ogk_other' })
    // The second connection has no remembered cursor, so it walks from page 1.
    expect(sent).toHaveLength(3)
    expect(sent[1]!.params['cursor']).toBeUndefined()
  })

  it('a total that is an exact multiple of the limit ends on a full page', async () => {
    // hasMore comes from `next`, not from "the page came back full".
    fakeOrdergroove(path, 2 * L, row)
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      expect(await call(method, params)).toHaveLength(L)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(more).toEqual([true, false])
  })

  it('a different limit is a different walk: its cursor is not reused', async () => {
    // Ordergroove's cursor is a row position minted at one page_size; reusing
    // it at another size would skip or repeat rows.
    const { sent } = fakeOrdergroove(path, N, row)
    await call(method, withPageSink({ page: 1, limit: L }))
    const rows = await call(method, withPageSink({ page: 2, limit: L - 1 }))
    expect(sent).toHaveLength(3)
    expect(sent[1]!.params['cursor']).toBeUndefined()
    const idKey = Object.keys(row(1))[0]!
    expect(ids(rows)).toEqual([4, 5, 6].map((i) => String(row(i)[idKey])))
  })

  it('staging and production walks on the same API key are kept apart', async () => {
    const { sent } = fakeOrdergroove(path, N, row)
    const prod: Credentials = { ...CREDS, extra: { merchantId: 'm1' } }
    const staging: Credentials = { ...CREDS, extra: { merchantId: 'm1', sandbox: true } }
    await call(method, withPageSink({ page: 1, limit: L }), prod)
    await call(method, withPageSink({ page: 2, limit: L }), staging)
    expect(sent).toHaveLength(3)
    expect(sent[1]!.params['cursor']).toBeUndefined()
  })
})

describe('Ordergroove paging across collections', () => {
  it('each collection keeps its own walk', async () => {
    const { sent } = fakeRoutes({
      '/customers/': { total: 9, row: (i) => ({ merchant_user_id: `u${i}` }) },
      '/orders/': { total: 9, row: (i) => ({ public_id: `o${i}` }) },
      '/products/': { total: 9, row: (i) => ({ external_product_id: `p${i}`, name: `P${i}` }) },
    })
    const all: Method[] = ['listProducts', 'listCustomers', 'listOrders']
    for (const m of all) await call(m, withPageSink({ page: 1, limit: 4 }))
    for (const m of all) {
      const before = sent.length
      await call(m, withPageSink({ page: 2, limit: 4 }))
      // Page 2 follows this collection's own cursor, on this collection's path.
      expect(sent.slice(before).map((s) => s.path)).toEqual([sent[all.indexOf(m)]!.path])
      expect(sent[before]!.params['cursor']).toBe(cursorFor(sent[before]!.path, 4))
    }
  })
})

describe('Ordergroove next URL outside cursor mode', () => {
  /**
   * If a deployment ignores X-OG-API-VERSION and answers in the legacy page
   * mode, its `next` is a `?page=N` URL. The adapter lays the whole `next`
   * query over its own request, so that walk still advances — while the
   * caller's page_size still wins over any page_size the URL carries.
   */
  it('follows a legacy ?page=N next and keeps the caller page_size', async () => {
    const total = 9
    const rows = Array.from({ length: total }, (_, i) => ({ public_id: `o${i + 1}` }))
    const sent: Array<Record<string, unknown>> = []
    const get = vi.fn(async (_p: string, config?: { params?: Record<string, unknown> }) => {
      const params = config?.params ?? {}
      sent.push(params)
      const size = Number(params['page_size'] ?? DEFAULT)
      const page = Number(params['page'] ?? 1)
      const results = rows.slice((page - 1) * size, page * size)
      const next =
        page * size < total ? `${BASE}/orders/?page=${page + 1}&page_size=${DEFAULT}` : null
      return { data: { count: total, next, previous: null, results } }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)

    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 4 })
      seen.push(...ids(await call('listOrders', params)))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(rows.map((r) => r.public_id))
    expect(more).toEqual([true, true, false])
    expect(sent.map((p) => p['page_size'])).toEqual([4, 4, 4])
  })
})

describe.each(CASES.filter((c) => c.method !== 'listProducts'))(
  'Ordergroove $method filtered paging',
  ({ method, path, row }) => {
    it('re-sends updated_start with the cursor and keys the walk by it', async () => {
      const { sent } = fakeOrdergroove(path, 9, row)
      const since = new Date('2026-01-02T03:04:05Z')
      await call(method, withPageSink({ page: 1, limit: 4, updatedAfter: since }))
      await call(method, withPageSink({ page: 2, limit: 4, updatedAfter: since }))
      expect(sent).toHaveLength(2)
      expect(sent[0]!.params['updated_start']).toBeDefined()
      expect(sent[1]!.params['cursor']).toBeDefined()
      expect(sent[1]!.params['updated_start']).toBe(sent[0]!.params['updated_start'])
      // A different filter is a different walk: page 2 of it starts from page 1.
      await call(
        method,
        withPageSink({ page: 2, limit: 4, updatedAfter: new Date('2026-02-01T00:00:00Z') }),
      )
      expect(sent).toHaveLength(4)
      expect(sent[2]!.params['cursor']).toBeUndefined()
    })
  },
)
