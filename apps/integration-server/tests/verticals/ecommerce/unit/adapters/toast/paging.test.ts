/**
 * Toast paging contract: discounts and inventory levels.
 *
 * GET /config/v2/discounts (Configuration API) pages by token only:
 * "A query parameter that controls the first object that the endpoint
 * returns in its response data. You get the string value of this parameter
 * from the Toast-Next-Page-Token header field in the response to a previous
 * request." and "If the response does not include a Toast-Next-Page-Token
 * field, there are no more data objects ... and there is no next page to
 * return." The old pageSize/page parameters "are deprecated and are removed
 * from the configuration API endpoints", and a page is sized by data volume,
 * not by a count. On HTTP 409 (configuration republished mid-walk) the client
 * "should re-submit the request it is making, without the pageToken query
 * parameter". (https://doc.toasttab.com/doc/devguide/apiResponseDataPagination.html)
 *
 * GET /stock/v1/inventory takes only `status` and returns a plain array of
 * every OUT_OF_STOCK / QUANTITY item: no paging at all
 * (https://doc.toasttab.com/openapi/stock/operation/getInventory/).
 *
 * The fake upstreams below honour ONLY those documented parameters.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { ToastAdapter } from '../../../../../../src/verticals/ecommerce/adapters/toast/index'

const RESTAURANT = 'rest-1'
const CREDS = { accessToken: 'toast-token', extra: { restaurantId: RESTAURANT } }
const TOKEN_HEADER = 'toast-next-page-token'

interface Call {
  path: string
  params: Record<string, unknown>
}

/** Data-sized upstream pages: 7, 3, 11, 7, 3, 11, ... rows. */
const SIZES = [7, 3, 11]

interface DiscountServerOpts {
  /** Throw a 409 on the Nth request carrying a pageToken (1-based), once. */
  conflictOnTokenCall?: number
  /** Status thrown on conflictOnTokenCall (default 409). */
  conflictStatus?: number
  /** Send an empty Toast-Next-Page-Token header on the last page. */
  emptyTokenOnLastPage?: boolean
}

function discountServer(rows: number, opts: DiscountServerOpts = {}) {
  const ids = Array.from({ length: rows }, (_, i) => `disc-${String(i + 1).padStart(4, '0')}`)
  const calls: Call[] = []
  // Page boundaries by data size, independent of anything the client sends.
  const starts: number[] = []
  for (let s = 0, k = 0; s < rows; s += SIZES[k % SIZES.length]!, k++) starts.push(s)
  if (starts.length === 0) starts.push(0)
  const tokenFor = (pageIndex: number) => `tok-${pageIndex}-${starts[pageIndex]}`
  let tokenCalls = 0
  let conflicted = false
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params })
    if (path !== '/config/v2/discounts') throw new Error(`unexpected path in test: ${path}`)
    let pageIndex = 0
    const token = params['pageToken']
    if (token !== undefined) {
      tokenCalls++
      if (!conflicted && opts.conflictOnTokenCall === tokenCalls) {
        conflicted = true
        const status = opts.conflictStatus ?? 409
        throw Object.assign(new Error(`${status} upstream error`), { response: { status } })
      }
      const m = /^tok-(\d+)-\d+$/.exec(String(token))
      if (!m || tokenFor(Number(m[1])) !== token) {
        throw Object.assign(new Error('400 bad pageToken'), { response: { status: 400 } })
      }
      pageIndex = Number(m[1])
    }
    // pageSize / page are ignored: removed from the Configuration API.
    const start = starts[pageIndex]!
    const end = pageIndex + 1 < starts.length ? starts[pageIndex + 1]! : rows
    const headers: Record<string, string> = {}
    if (pageIndex + 1 < starts.length) headers[TOKEN_HEADER] = tokenFor(pageIndex + 1)
    else if (opts.emptyTokenOnLastPage) headers[TOKEN_HEADER] = ''
    return {
      data: ids
        .slice(start, end)
        .map((guid) => ({ guid, name: guid, type: 'PERCENT', percentage: 10 })),
      headers,
    }
  })
  return { get, calls, ids, tokenFor, starts }
}

function inventoryServer(rows: number) {
  const guids = Array.from({ length: rows }, (_, i) => `item-${String(i + 1).padStart(4, '0')}`)
  const calls: Call[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    calls.push({ path, params: config?.params ?? {} })
    if (path !== '/stock/v1/inventory') throw new Error(`unexpected path in test: ${path}`)
    // Only `status` is documented; everything else is ignored. The whole
    // at-risk set comes back in one plain array.
    return { data: guids.map((guid) => ({ guid, status: 'QUANTITY', quantity: 2 })), headers: {} }
  })
  return { get, calls, ids: guids.map((g) => `${g}:${RESTAURANT}`) }
}

function mount(server: { get: unknown }) {
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get, defaults: {} } as never)
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

type Method = 'listDiscounts' | 'listInventoryLevels'

async function ids(adapter: ToastAdapter, method: Method, params: QueryParams): Promise<string[]> {
  const rows = (await adapter[method](CREDS, params)) as { id: string }[]
  return rows.map((r) => r.id)
}

const CASES: { method: Method; make: (n: number) => { get: unknown; ids: string[] } }[] = [
  { method: 'listDiscounts', make: (n) => discountServer(n) },
  { method: 'listInventoryLevels', make: (n) => inventoryServer(n) },
]

describe.each(CASES)('Toast $method paging', ({ method, make }) => {
  it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
    for (const L of [2, 7, 10, 25]) {
      _resetRowPager()
      const server = make(2 * L + 1)
      mount(server)
      const adapter = new ToastAdapter()
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        seen.push(...(await ids(adapter, method, params)))
        hasMore.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(server.ids)
      expect(hasMore).toEqual([true, true, false])
      vi.restoreAllMocks()
    }
  })

  it('clamps a limit above the router maximum and still serves every row', async () => {
    const MAX = parseListQuery({ limit: '5000', page: '1' }).limit!
    expect(MAX).toBeLessThan(5000)
    const server = make(2 * MAX + 1)
    mount(server)
    const adapter = new ToastAdapter()
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(10)
      const params = withPageSink(parseListQuery({ limit: '5000', page: String(page) }))
      const rows = await ids(adapter, method, params)
      expect(rows.length).toBeLessThanOrEqual(MAX)
      seen.push(...rows)
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(server.ids)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const server = make(125)
    mount(server)
    const adapter = new ToastAdapter()
    const p1 = parseListQuery({ limit: '60', page: '1' })
    const r1 = listPage((await adapter[method](CREDS, p1)) as { id: string }[], p1, 'toast')
    expect(r1.data.map((r) => r.id)).toEqual(server.ids.slice(0, 60))
    expect(r1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '60', page: '3' })
    const r3 = listPage((await adapter[method](CREDS, p3)) as { id: string }[], p3, 'toast')
    expect(r3.data.map((r) => r.id)).toEqual(server.ids.slice(120))
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('Toast listDiscounts pageToken', () => {
  it('page 2 carries the documented pageToken and no pageSize/page', async () => {
    const L = 10
    const server = discountServer(2 * L + 1)
    mount(server)
    const adapter = new ToastAdapter()
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    expect(await ids(adapter, 'listDiscounts', params)).toEqual(server.ids.slice(L, 2 * L))
    expect(server.calls[0]!.params).toEqual({})
    const tokenCalls = server.calls.filter((c) => c.params['pageToken'] !== undefined)
    expect(tokenCalls.length).toBeGreaterThan(0)
    expect(tokenCalls[0]!.params).toEqual({ pageToken: server.tokenFor(1) })
    for (const c of server.calls) {
      expect(c.params['pageSize']).toBeUndefined()
      expect(c.params['page']).toBeUndefined()
    }
  })

  it('a 409 mid-walk restarts from the first page without pageToken', async () => {
    const L = 10
    const server = discountServer(2 * L + 1, { conflictOnTokenCall: 1 })
    mount(server)
    const adapter = new ToastAdapter()
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    expect(await ids(adapter, 'listDiscounts', params)).toEqual(server.ids.slice(L, 2 * L))
    const firstPageCalls = server.calls.filter((c) => c.params['pageToken'] === undefined)
    expect(firstPageCalls.length).toBe(2)
  })

  it('a non-409 error mid-walk surfaces and does not restart the walk', async () => {
    const L = 10
    const server = discountServer(2 * L + 1, { conflictOnTokenCall: 1, conflictStatus: 400 })
    mount(server)
    const adapter = new ToastAdapter()
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    await expect(adapter.listDiscounts(CREDS, params)).rejects.toThrow('400')
    const firstPageCalls = server.calls.filter((c) => c.params['pageToken'] === undefined)
    expect(firstPageCalls.length).toBe(1)
  })

  it('an empty Toast-Next-Page-Token header ends the walk', async () => {
    const server = discountServer(21, { emptyTokenOnLastPage: true })
    mount(server)
    const adapter = new ToastAdapter()
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(10)
      const params = withPageSink({ page, limit: 10 } as QueryParams)
      seen.push(...(await ids(adapter, 'listDiscounts', params)))
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(server.ids)
    expect(server.calls.some((c) => c.params['pageToken'] === '')).toBe(false)
  })

  it('keeps two restaurants on one token apart', async () => {
    const a = discountServer(30)
    const b = discountServer(30)
    vi.spyOn(axios, 'create').mockImplementation(((config: {
      headers?: Record<string, string>
    }) => {
      const rid = config.headers?.['Toast-Restaurant-External-ID']
      const server = rid === 'rest-a' ? a : rid === 'rest-b' ? b : undefined
      if (!server) throw new Error(`unexpected restaurant in test: ${rid}`)
      return { get: server.get, defaults: {} }
    }) as never)
    const adapter = new ToastAdapter()
    const credsA = { accessToken: 'shared-token', extra: { restaurantId: 'rest-a' } }
    const credsB = { accessToken: 'shared-token', extra: { restaurantId: 'rest-b' } }
    await adapter.listDiscounts(credsA, withPageSink({ page: 1, limit: 10 } as QueryParams))
    await adapter.listDiscounts(credsB, withPageSink({ page: 2, limit: 10 } as QueryParams))
    expect(b.calls[0]!.params['pageToken']).toBeUndefined()
  })

  it('keeps two connections apart', async () => {
    const a = discountServer(30)
    const b = discountServer(30)
    vi.spyOn(axios, 'create').mockImplementation(((config: {
      headers?: Record<string, string>
    }) => {
      const auth = config.headers?.['Authorization']
      const server = auth === 'Bearer token-a' ? a : auth === 'Bearer token-b' ? b : undefined
      if (!server) throw new Error(`unexpected auth in test: ${auth}`)
      return { get: server.get, defaults: {} }
    }) as never)
    const adapter = new ToastAdapter()
    const credsA = { accessToken: 'token-a', extra: { restaurantId: RESTAURANT } }
    const credsB = { accessToken: 'token-b', extra: { restaurantId: RESTAURANT } }
    await adapter.listDiscounts(credsA, withPageSink({ page: 1, limit: 10 } as QueryParams))
    await adapter.listDiscounts(credsB, withPageSink({ page: 2, limit: 10 } as QueryParams))
    expect(b.calls[0]!.params['pageToken']).toBeUndefined()
  })
})

describe('Toast listInventoryLevels', () => {
  it('sends no paging parameters (the endpoint has none)', async () => {
    const server = inventoryServer(9)
    mount(server)
    const adapter = new ToastAdapter()
    await adapter.listInventoryLevels(CREDS, withPageSink({ page: 2, limit: 4 } as QueryParams))
    expect(server.calls.map((c) => c.params)).toEqual([{}])
    const params = withPageSink({ page: 3, limit: 4 } as QueryParams)
    await adapter.listInventoryLevels(CREDS, params)
    expect(readUpstreamPage(params)?.totalCount).toBe(9)
  })
})
