/**
 * Shopee list paging: what each list method sends, driven through the real
 * adapter with the router's own `parseListQuery` and the sync worker's
 * `withPageSink({ page, limit })`.
 *
 * Paging semantics per endpoint, from the Shopee Open Platform v2 docs
 * (https://open.shopee.com/documents/v2/<api_name>, served as JSON at
 * https://open.shopee.com/opservice/api/v1/doc/api/?version=2&api_name=<api_name>):
 *
 *   v2.product.get_item_list
 *     offset    "Specifies the starting entry of data to return in the current
 *                call. Default is 0." → 0-based ROW offset
 *     page_size limits "[1,100]", "the size of one page.Max=100"
 *     has_next_page "This is to indicate whether the item list is more than one page."
 *   v2.product.get_item_base_info
 *     item_id_list "item_id list; limit [0,50]" → a 100-id page takes two calls
 *   v2.shop_category.get_shop_category_list
 *     page_no   "The parameter range of page_no should be [1, 100]" → 1-based page
 *     page_size "The parameter range of page_size should be [1, 2147483647]"
 *     The two descriptions are swapped on that page ("page_size": "Specifies the
 *     starting entry…", "page_no": "Specifies the total returned data per
 *     entry…"), and the third-party congminh1254/shopee-sdk reads the ranges the
 *     other way round (page_size [1, 100]). The fake takes the stricter reading,
 *     so the adapter must clamp to 100 — valid under both.
 *   v2.returns.get_return_list / v2.payment.get_wallet_transaction_list
 *     page_no   "Specifies the starting entry of data to return in the current
 *                call. Default is 0." → 0-based (first-party). That it is a PAGE
 *                index rather than a row offset is third-party evidence only: a
 *                field report observed get_return_list `page_no: 0 → 3 bản ghi /
 *                page_no: 1 → 0 bản ghi` (3 rows, then 0 — a row offset would
 *                have given 2), and congminh1254/shopee-sdk walks the wallet
 *                from `let pageNo = 0;` by 1. The wallet reading is UNVERIFIED
 *                against a live shop.
 *     page_size "maximum number of entries (<= 100)"
 *   v2.discount.get_discount_list
 *     page_no   "Specifies the page number of data to return in the current
 *                call. Starting from 1." → 1-based page
 *     page_size "maximum number of entries (<= 100)"
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  parseListQuery,
  withPageSink,
  readUpstreamPage,
  listPage,
  collectionIsComplete,
  type QueryParams,
} from '@opensteward/shared'
import { ShopeeAdapter } from '../../../../../../src/verticals/ecommerce/adapters/shopee/index'

const CREDS = {
  accessToken: 'tok',
  extra: { partnerId: 1001, partnerKey: 'partner-key', shopId: 2002 },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

type Paging = 'offset' | 'page1' | 'page0'

/** Row window a documented request asks for, or an Error for an out-of-range one. */
function rowWindow(paging: Paging, p: Record<string, unknown>, max: number): [number, number] {
  const size = Number(p['page_size'])
  if (!Number.isInteger(size) || size < 1 || size > max) {
    throw new Error(`fake shopee: page_size ${String(p['page_size'])} outside [1, ${max}]`)
  }
  if (paging === 'offset') {
    const offset = Number(p['offset'])
    if (!Number.isInteger(offset) || offset < 0)
      throw new Error(`fake shopee: offset ${String(p['offset'])}`)
    return [offset, offset + size]
  }
  const pageNo = Number(p['page_no'])
  const first = paging === 'page1' ? 1 : 0
  if (!Number.isInteger(pageNo) || pageNo < first) {
    throw new Error(`fake shopee: page_no ${String(p['page_no'])} below ${first}`)
  }
  const start = (pageNo - first) * size
  return [start, start + size]
}

/**
 * A Shopee that honours ONLY the documented paging parameters of each
 * endpoint. Rows are ids 1..total, in order. `missingDetail` ids are listed by
 * get_item_list but not returned by get_item_base_info — an item removed
 * between the two calls.
 */
function fakeShopee(total: number, missingDetail: ReadonlySet<number> = new Set()) {
  const calls: Call[] = []
  const ids = Array.from({ length: total }, (_, i) => i + 1)
  const answer = (path: string, p: Record<string, unknown>): unknown => {
    switch (path) {
      case '/product/get_item_list': {
        const [from, to] = rowWindow('offset', p, 100)
        const slice = ids.slice(from, to)
        return {
          error: '',
          response: {
            item: slice.map((id) => ({ item_id: id })),
            total_count: total,
            has_next_page: to < total,
            next_offset: to,
          },
        }
      }
      case '/product/get_item_base_info': {
        const list = String(p['item_id_list']).split(',').map(Number)
        if (list.length > 50)
          throw new Error(`fake shopee: item_id_list has ${list.length} ids, limit [0,50]`)
        return {
          error: '',
          response: {
            item_list: list
              .filter((id) => !missingDetail.has(id))
              .map((id) => ({ item_id: id, item_name: `I${id}` })),
          },
        }
      }
      case '/shop_category/get_shop_category_list': {
        const [from, to] = rowWindow('page1', p, 100)
        const slice = ids.slice(from, to)
        return {
          error: '',
          response: {
            shop_categorys: slice.map((id) => ({ shop_category_id: id, name: `C${id}` })),
            total_count: total,
            more: to < total,
          },
        }
      }
      case '/returns/get_return_list': {
        const [from, to] = rowWindow('page0', p, 100)
        return {
          error: '',
          response: {
            return: ids.slice(from, to).map((id) => ({ return_sn: String(id) })),
            more: to < total,
          },
        }
      }
      case '/payment/get_wallet_transaction_list': {
        const [from, to] = rowWindow('page0', p, 100)
        return {
          error: '',
          response: {
            transaction_list: ids.slice(from, to).map((id) => ({ withdrawal_id: id })),
            more: to < total,
          },
        }
      }
      case '/discount/get_discount_list': {
        const [from, to] = rowWindow('page1', p, 100)
        return {
          error: '',
          response: {
            discount_list: ids.slice(from, to).map((id) => ({ discount_id: id })),
            more: to < total,
          },
        }
      }
      default:
        throw new Error(`fake shopee: unexpected GET ${path}`)
    }
  }
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    return { data: answer(path, params) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() } },
  } as never)
  return calls
}

interface Method {
  name: string
  path: string
  paging: Paging
  run: (adapter: ShopeeAdapter, params: QueryParams) => Promise<string[]>
}

/** Every fixed list method's documented page_size ceiling (see header). */
const MAX = 100
/** The adapter's own page size for a direct call that names no limit. */
const DEFAULT = 50

const METHODS: Method[] = [
  {
    name: 'listProducts',
    path: '/product/get_item_list',
    paging: 'offset',
    run: async (a, p) => (await a.listProducts(CREDS, p)).map((r) => r.id),
  },
  {
    name: 'listInventoryLevels',
    path: '/product/get_item_list',
    paging: 'offset',
    run: async (a, p) => (await a.listInventoryLevels(CREDS, p)).map((r) => r.variantId),
  },
  {
    name: 'listCollections',
    path: '/shop_category/get_shop_category_list',
    paging: 'page1',
    run: async (a, p) => (await a.listCollections(CREDS, p)).map((r) => r.id),
  },
  {
    name: 'listRefunds',
    path: '/returns/get_return_list',
    paging: 'page0',
    run: async (a, p) => (await a.listRefunds(CREDS, p)).map((r) => r.id),
  },
  {
    name: 'listTransactions',
    path: '/payment/get_wallet_transaction_list',
    paging: 'page0',
    run: async (a, p) => (await a.listTransactions(CREDS, p)).map((r) => r.id),
  },
  {
    name: 'listDiscounts',
    path: '/discount/get_discount_list',
    paging: 'page1',
    run: async (a, p) => (await a.listDiscounts(CREDS, p)).map((r) => r.id),
  },
]

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => String(from + i))

/** The paging params a correct request carries for 1-based `page` and `size`. */
function expected(paging: Paging, page: number, size: number): Record<string, number> {
  if (paging === 'offset') return { offset: (page - 1) * size, page_size: size }
  if (paging === 'page1') return { page_no: page, page_size: size }
  return { page_no: page - 1, page_size: size }
}

function listCall(calls: Call[], path: string): Call {
  const call = calls.find((c) => c.path === path)
  if (!call) throw new Error(`no GET ${path} in ${JSON.stringify(calls.map((c) => c.path))}`)
  return call
}

/**
 * Walk a list the way SyncWorker does: page size min(500, maxPageSize), and
 * stop on the adapter's reported `hasMore` when it gave one, else on a short
 * page (packages/shared/src/data-store/sync-worker.ts).
 */
async function syncWalk(m: Method, adapter: ShopeeAdapter): Promise<string[]> {
  const limit = Math.min(500, adapter.capabilities?.maxPageSize ?? 500)
  const seen: string[] = []
  for (let page = 1; page <= 20; page++) {
    const params = withPageSink({ page, limit })
    const rows = await m.run(adapter, params)
    seen.push(...rows)
    const reported = readUpstreamPage(params)?.hasMore
    if (typeof reported === 'boolean' ? !reported : rows.length < limit) break
  }
  return seen
}

afterEach(() => vi.restoreAllMocks())

describe('ShopeeAdapter list paging', () => {
  it('declares the documented page_size ceiling shared by its list methods', () => {
    // 100 for get_item_list, get_return_list, get_wallet_transaction_list and
    // get_discount_list, and the clamp taken for get_shop_category_list. A
    // larger sync page would be refused or come back short.
    expect(new ShopeeAdapter().capabilities?.maxPageSize).toBe(MAX)
  })

  it.each(METHODS)('$name: page 1 asks for the first rows', async (m) => {
    const calls = fakeShopee(35)
    const ids = await m.run(new ShopeeAdapter(), parseListQuery({ page: '1', limit: '10' }))
    expect(ids).toEqual(range(1, 10))
    expect(listCall(calls, m.path).params).toMatchObject(expected(m.paging, 1, 10))
  })

  it.each(METHODS)('$name: page 2 asks for the next rows', async (m) => {
    const calls = fakeShopee(35)
    const ids = await m.run(new ShopeeAdapter(), parseListQuery({ page: '2', limit: '10' }))
    expect(ids).toEqual(range(11, 20))
    expect(listCall(calls, m.path).params).toMatchObject(expected(m.paging, 2, 10))
  })

  it.each(METHODS)('$name: a missing page is the first page', async (m) => {
    const calls = fakeShopee(35)
    const ids = await m.run(new ShopeeAdapter(), parseListQuery({ limit: '10' }))
    expect(ids).toEqual(range(1, 10))
    expect(listCall(calls, m.path).params).toMatchObject(expected(m.paging, 1, 10))
  })

  // parseListQuery reads 0, -3 and non-numbers as the first page before an
  // adapter sees them, so this guard is for direct callers: built directly.
  it.each(METHODS)('$name: a direct page 0 or -3 is the first page', async (m) => {
    for (const page of [0, -3]) {
      const calls = fakeShopee(35)
      const params = parseListQuery({ limit: '10' })
      params.page = page
      const ids = await m.run(new ShopeeAdapter(), params)
      expect(ids).toEqual(range(1, 10))
      expect(listCall(calls, m.path).params).toMatchObject(expected(m.paging, 1, 10))
      vi.restoreAllMocks()
    }
  })

  it.each(METHODS)(
    '$name: a limit above the documented max is clamped, and page 2 strides by the clamp',
    async (m) => {
      const calls = fakeShopee(3 * MAX + 1)
      const ids = await m.run(new ShopeeAdapter(), parseListQuery({ page: '2', limit: '500' }))
      expect(ids).toEqual(range(MAX + 1, 2 * MAX))
      expect(listCall(calls, m.path).params).toMatchObject(expected(m.paging, 2, MAX))
    },
  )

  it.each(METHODS)('$name: with no limit at all, sends the adapter default of 50', async (m) => {
    const calls = fakeShopee(60)
    const ids = await m.run(new ShopeeAdapter(), {})
    expect(ids).toEqual(range(1, DEFAULT))
    expect(listCall(calls, m.path).params).toMatchObject(expected(m.paging, 1, DEFAULT))
  })

  it.each(METHODS)(
    "$name: the router's default page (no query at all) is a full page, so it is not cached as the whole collection",
    async (m) => {
      // parseListQuery({}) asks for 100. A page clamped below that came back
      // "short", and the cache marked 50 rows of 120 as the complete collection.
      fakeShopee(120)
      const params = parseListQuery({})
      const ids = await m.run(new ShopeeAdapter(), params)
      expect(ids).toEqual(range(1, 100))
      expect(listPage(ids, params, 'shopee').meta.hasMore).toBe(true)
      expect(collectionIsComplete(params, ids)).toBe(false)
    },
  )

  it.each(METHODS)("$name: passes on Shopee's own next-page flag", async (m) => {
    fakeShopee(35)
    const first = parseListQuery({ page: '1', limit: '10' })
    await m.run(new ShopeeAdapter(), first)
    expect(readUpstreamPage(first)?.hasMore).toBe(true)

    vi.restoreAllMocks()
    fakeShopee(35)
    const last = parseListQuery({ page: '4', limit: '10' })
    expect(await m.run(new ShopeeAdapter(), last)).toEqual(range(31, 35))
    expect(readUpstreamPage(last)?.hasMore).toBe(false)
  })

  it.each(METHODS)(
    '$name: a sync-style walk returns every row exactly once, in order',
    async (m) => {
      const adapter = new ShopeeAdapter()
      const total = 2 * Math.min(500, adapter.capabilities?.maxPageSize ?? 500) + 1
      fakeShopee(total)
      expect(await syncWalk(m, adapter)).toEqual(range(1, total))
    },
  )

  it('listProducts asks get_item_base_info for at most 50 ids per call', async () => {
    const calls = fakeShopee(120)
    const ids = await new ShopeeAdapter().listProducts(CREDS, parseListQuery({ limit: '100' }))
    expect(ids.map((p) => p.id)).toEqual(range(1, 100))
    const detail = calls.filter((c) => c.path === '/product/get_item_base_info')
    expect(detail.map((c) => String(c.params['item_id_list']))).toEqual([
      range(1, 50).join(','),
      range(51, 100).join(','),
    ])
  })

  it.each(METHODS.filter((m) => m.path === '/product/get_item_list'))(
    '$name: an item missing from get_item_base_info does not end the sync walk',
    async (m) => {
      // Page 1 comes back one short (99 of 100). Without Shopee's has_next_page
      // the walk would read that as the last page and mark the collection complete.
      const adapter = new ShopeeAdapter()
      const total = 2 * Math.min(500, adapter.capabilities?.maxPageSize ?? 500) + 1
      fakeShopee(total, new Set([50]))
      expect(await syncWalk(m, adapter)).toEqual(range(1, total).filter((id) => id !== '50'))
    },
  )
})

describe('ShopeeAdapter getTransaction', () => {
  // It scans get_wallet_transaction_list itself, so it must number page_no the
  // same way listTransactions does.
  it('finds a transaction on the first wallet page (page_no 0)', async () => {
    const calls = fakeShopee(150)
    const txn = await new ShopeeAdapter().getTransaction(CREDS, '1')
    expect(txn.id).toBe('1')
    expect(calls[0]?.params).toMatchObject({ page_no: 0, page_size: 100 })
  })

  it('finds a transaction on the second wallet page (page_no 1)', async () => {
    const calls = fakeShopee(150)
    const txn = await new ShopeeAdapter().getTransaction(CREDS, '150')
    expect(txn.id).toBe('150')
    expect(calls.map((c) => c.params['page_no'])).toEqual([0, 1])
  })

  it('scans at most 10 wallet pages (page_no 0-9)', async () => {
    const calls = fakeShopee(1500)
    await expect(new ShopeeAdapter().getTransaction(CREDS, '1500')).rejects.toThrow(
      /not found in recent wallet history/,
    )
    expect(calls.map((c) => c.params['page_no'])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})
