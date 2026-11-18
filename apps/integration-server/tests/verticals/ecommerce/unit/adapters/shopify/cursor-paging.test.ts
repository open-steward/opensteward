/**
 * Shopify pages by cursor (`page_info` in the Link header); the sync worker
 * asks by number. The adapter used to ignore `page`, so page 2 of any list was
 * page 1 again. A collection over 250 rows re-fetched the same page until the
 * worker's 10,000-page ceiling.
 *
 * Every list now resolves `page` through the shared cursor pager and reports
 * through the page sink whether more remains — which also fixes the lists
 * that are not one upstream page of their own rows (fulfillments, refunds and
 * transactions from pages of orders; collections from two endpoints;
 * inventory levels from batches of locations), where a short page never meant
 * the end.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  parseListQuery,
  listPage,
} from '@opensteward/shared'
import { ShopifyAdapter } from '../../../../../../src/verticals/ecommerce/adapters/shopify/index'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/ecommerce/shopify/callback',
}
const shopCreds = (shop: string) => ({ accessToken: `tok-${shop}`, extra: { shop } })
const CREDS = shopCreds('acme')

interface Call {
  path: string
  params: Record<string, unknown>
}
type Answer = { body: unknown; next?: string }

/** Fake axios instance: answers by path, emits a Link header when `next` is set. */
function fakeShopify(answer: (path: string, params: Record<string, unknown>) => Answer) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    const { body, next } = answer(path, params)
    const headers = next
      ? { link: `<https://acme.myshopify.com/admin/api/2026-07/${path}?limit=250&page_info=${next}>; rel="next"` }
      : {}
    return { data: body, headers }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return calls
}

/** A `total`-row collection behind `page_info` = next offset (optionally prefixed). */
function paged<T>(total: number, key: string, make: (i: number) => T, prefix = '') {
  return (params: Record<string, unknown>): Answer => {
    const raw = params['page_info']
    const offset = raw != null ? Number(String(raw).slice(prefix.length)) : 0
    const limit = Number(params['limit'])
    const rows = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) =>
      make(offset + i),
    )
    const nextOffset = offset + rows.length
    return {
      body: { [key]: rows },
      next: nextOffset < total ? `${prefix}${nextOffset}` : undefined,
    }
  }
}

const product = (i: number) => ({ id: 1000 + i, title: `P${i}`, variants: [], options: [] })

async function page<T>(
  list: (p: ReturnType<typeof withPageSink>) => Promise<T[]>,
  n: number,
  limit = 250,
) {
  const params = withPageSink({ page: n, limit })
  const items = await list(params)
  return { items, hasMore: readUpstreamPage(params)?.hasMore }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('products', () => {
  it('page 2 is the second 250 rows, reached through the Link-header cursor', async () => {
    const products = paged(600, 'products', product)
    const calls = fakeShopify((_p, params) => products(params))
    const adapter = new ShopifyAdapter(CFG)
    const list = (p: ReturnType<typeof withPageSink>) => adapter.listProducts(CREDS, p)

    const p1 = await page(list, 1)
    const p2 = await page(list, 2)
    const p3 = await page(list, 3)

    expect(p1.items.map((x) => x.id).slice(0, 1)).toEqual(['1000'])
    expect(p2.items.map((x) => x.id).slice(0, 1)).toEqual(['1250'])
    expect(p3.items).toHaveLength(100)
    expect(new Set([...p1.items, ...p2.items, ...p3.items].map((x) => x.id)).size).toBe(600)
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    // One request per page, each following the previous page's cursor.
    expect(calls.map((c) => c.params['page_info'])).toEqual([undefined, '250', '500'])
  })

  it('an explicit cursor is one request at that position, and still reports hasMore', async () => {
    const products = paged(600, 'products', product)
    const calls = fakeShopify((_p, params) => products(params))
    const params = withPageSink({ limit: 250, cursor: '500' })
    const items = await new ShopifyAdapter(CFG).listProducts(CREDS, params)
    expect(items).toHaveLength(100)
    expect(calls).toHaveLength(1)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('two shops never share cursors', async () => {
    const products = paged(600, 'products', product)
    const calls = fakeShopify((_p, params) => products(params))
    const adapter = new ShopifyAdapter(CFG)
    await adapter.listProducts(shopCreds('acme'), { page: 1, limit: 250 })
    await adapter.listProducts(shopCreds('other'), { page: 2, limit: 250 })
    // `other` has no cursor for page 2 yet, so it walks from its own page 1.
    expect(calls.map((c) => c.params['page_info'])).toEqual([undefined, undefined, '250'])
  })
})

/**
 * Walk a list the way a client does — through `parseListQuery` and the
 * router's `listPage` — until the envelope says there is no more. Returns the
 * ids served and each page's size.
 */
async function walk<T extends { id: string }>(
  list: (p: ReturnType<typeof parseListQuery>) => Promise<T[]>,
  limit: number,
) {
  const ids: string[] = []
  const sizes: number[] = []
  for (let n = 1; n < 1000; n++) {
    const params = parseListQuery({ limit: String(limit), page: String(n) })
    const env = listPage(await list(params), params, 'shopify')
    ids.push(...env.data.map((x) => x.id))
    sizes.push(env.data.length)
    if (env.meta.hasMore !== true) break
  }
  return { ids, sizes }
}

/** Every page `limit` rows but the last, which holds the rest. */
function fullPages(total: number, limit: number): number[] {
  const out = Array.from({ length: Math.floor(total / limit) }, () => limit)
  if (total % limit > 0 || out.length === 0) out.push(total % limit)
  return out
}

// Rewritten when these lists moved to the row pager. A page used to be one
// upstream page of parents (orders, products, or custom collections and smart
// collections side by side) with every row flattened out of it — 0 rows or
// 260 on a page asked for 250 — so the router truncated rows away and a sync
// counted pages of parents. Now each page is exactly `limit` rows of the
// flattened stream, and `hasMore` is exact.
describe('lists that are not one upstream page of their own rows', () => {
  it('collections: every custom collection, then every smart one, in pages of the limit', async () => {
    const custom = paged(300, 'custom_collections', (i) => ({ id: 1 + i, title: `C${i}` }), 'c')
    const smart = paged(10, 'smart_collections', (i) => ({ id: 9000 + i, title: `S${i}` }), 's')
    fakeShopify((path, params) => (path.startsWith('custom') ? custom(params) : smart(params)))
    const adapter = new ShopifyAdapter(CFG)
    const list = (p: ReturnType<typeof withPageSink>) => adapter.listCollections(CREDS, p)

    const p1 = await page(list, 1)
    const p2 = await page(list, 2)
    expect(p1.items).toHaveLength(250)
    expect(p1.hasMore).toBe(true)
    expect(p2.items.map((c) => c.id)).toEqual([
      ...Array.from({ length: 50 }, (_, i) => String(251 + i)),
      ...Array.from({ length: 10 }, (_, i) => String(9000 + i)),
    ])
    expect(p2.hasMore).toBe(false)
  })

  it('collections: a walk at limit 10 serves each once, one request per upstream page', async () => {
    const custom = paged(23, 'custom_collections', (i) => ({ id: 1 + i, title: `C${i}` }), 'c')
    const smart = paged(7, 'smart_collections', (i) => ({ id: 9000 + i, title: `S${i}` }), 's')
    const calls = fakeShopify((path, params) =>
      path.startsWith('custom') ? custom(params) : smart(params),
    )
    const adapter = new ShopifyAdapter(CFG)
    const { ids, sizes } = await walk((p) => adapter.listCollections(CREDS, p), 10)
    expect(ids).toEqual([
      ...Array.from({ length: 23 }, (_, i) => String(1 + i)),
      ...Array.from({ length: 7 }, (_, i) => String(9000 + i)),
    ])
    expect(sizes).toEqual([10, 10, 10])
    expect(calls.map((c) => `${c.path}:${c.params['page_info'] ?? '-'}`)).toEqual([
      'custom_collections.json:-',
      'custom_collections.json:c10',
      'custom_collections.json:c20',
      'smart_collections.json:-',
    ])
  })

  it('fulfillments: sparse rows across pages of orders fill one page, and hasMore is exact', async () => {
    // 300 orders, only every 100th has a fulfillment: all three are page 1,
    // found by walking both 250-order pages, and nothing remains.
    const orders = paged(300, 'orders', (i) => ({
      id: 5000 + i,
      currency: 'NOK',
      fulfillments:
        i % 100 === 0 ? [{ id: 70000 + i, order_id: 5000 + i, status: 'success', line_items: [] }] : [],
      refunds: [],
    }))
    const calls = fakeShopify((_p, params) => orders(params))
    const adapter = new ShopifyAdapter(CFG)
    const list = (p: ReturnType<typeof withPageSink>) => adapter.listFulfillments(CREDS, p)

    const p1 = await page(list, 1)
    expect(p1.items.map((f) => f.id)).toEqual(['70000', '70100', '70200'])
    expect(p1.hasMore).toBe(false)
    expect(calls.map((c) => c.params['limit'])).toEqual([250, 250])
    const p2 = await page(list, 2)
    expect(p2).toEqual({ items: [], hasMore: false })
    expect(calls).toHaveLength(2)
  })

  it('fulfillments: a walk at limit 10 serves every one once, each page of orders read once', async () => {
    // Order i carries i % 3 fulfillments: 600 in all, across 600 orders.
    const orders = paged(600, 'orders', (i) => ({
      id: 5000 + i,
      currency: 'NOK',
      fulfillments: Array.from({ length: i % 3 }, (_, k) => ({
        id: 700000 + i * 10 + k,
        order_id: 5000 + i,
        status: 'success',
        line_items: [],
      })),
      refunds: [],
    }))
    const calls = fakeShopify((_p, params) => orders(params))
    const adapter = new ShopifyAdapter(CFG)
    const { ids, sizes } = await walk((p) => adapter.listFulfillments(CREDS, p), 10)
    const expected = Array.from({ length: 600 }, (_, i) =>
      Array.from({ length: i % 3 }, (_, k) => String(700000 + i * 10 + k)),
    ).flat()
    expect(ids).toEqual(expected)
    expect(sizes).toEqual(fullPages(600, 10))
    expect(calls.map((c) => c.params['page_info'])).toEqual([undefined, '250', '500'])
  })

  it('refunds: a walk at limit 10 over sparse refunds serves each once', async () => {
    // Every 37th of 520 orders has a refund: 15, spread over three order pages.
    const orders = paged(520, 'orders', (i) => ({
      id: 5000 + i,
      currency: 'NOK',
      fulfillments: [],
      refunds:
        i % 37 === 0 ? [{ id: 90000 + i, order_id: 5000 + i, refund_line_items: [], transactions: [] }] : [],
    }))
    const calls = fakeShopify((_p, params) => orders(params))
    const adapter = new ShopifyAdapter(CFG)
    const { ids, sizes } = await walk((p) => adapter.listRefunds(CREDS, p), 10)
    expect(ids).toEqual(Array.from({ length: 15 }, (_, k) => String(90000 + k * 37)))
    expect(sizes).toEqual([10, 5])
    expect(calls).toHaveLength(3)
  })

  it('transactions: a walk at limit 10 serves each once and asks each order once', async () => {
    // Order i has 1 transaction, 2 if i is odd: 37 across 25 orders. Orders
    // are read 10 at a time — each costs a request of its own.
    const orders = paged(25, 'orders', (i) => ({ id: 5000 + i, currency: 'NOK', fulfillments: [], refunds: [] }))
    const calls = fakeShopify((path, params) => {
      if (path === 'orders.json') return orders(params)
      const id = Number(path.split('/')[1])
      const n = ((id - 5000) % 2) + 1
      return {
        body: {
          transactions: Array.from({ length: n }, (_, k) => ({
            id: id * 10 + k,
            order_id: id,
            kind: 'sale',
            status: 'success',
            amount: '1.00',
            currency: 'NOK',
            created_at: '2026-09-12T00:00:00Z',
          })),
        },
      }
    })
    const adapter = new ShopifyAdapter(CFG)
    const { ids, sizes } = await walk((p) => adapter.listTransactions(CREDS, p), 10)
    const expected = Array.from({ length: 25 }, (_, i) =>
      Array.from({ length: (i % 2) + 1 }, (_, k) => String((5000 + i) * 10 + k)),
    ).flat()
    expect(ids).toEqual(expected)
    expect(sizes).toEqual(fullPages(37, 10))
    const perOrder = calls.filter((c) => c.path.endsWith('/transactions.json')).map((c) => c.path)
    expect(perOrder).toHaveLength(25)
    expect(new Set(perOrder).size).toBe(25)
    expect(calls.filter((c) => c.path === 'orders.json').map((c) => c.params['limit'])).toEqual([
      10, 10, 10,
    ])
    // Every status: Shopify lists only open orders by default, and the
    // transactions of closed and cancelled orders are still transactions.
    expect(calls.find((c) => c.path === 'orders.json')?.params['status']).toBe('any')
  })

  it('variants without a product: a walk at limit 10 serves each once', async () => {
    // Product i has i % 4 variants: 43 across 30 products.
    const products = paged(30, 'products', (i) => ({
      id: 1000 + i,
      title: `P${i}`,
      options: [],
      variants: Array.from({ length: i % 4 }, (_, k) => ({
        id: (1000 + i) * 10 + k,
        product_id: 1000 + i,
        title: `V${k}`,
        price: '1.00',
      })),
    }))
    const calls = fakeShopify((_p, params) => products(params))
    const adapter = new ShopifyAdapter(CFG)
    const { ids, sizes } = await walk((p) => adapter.listVariants(CREDS, p), 10)
    const expected = Array.from({ length: 30 }, (_, i) =>
      Array.from({ length: i % 4 }, (_, k) => String((1000 + i) * 10 + k)),
    ).flat()
    expect(ids).toEqual(expected)
    expect(sizes).toEqual(fullPages(43, 10))
    expect(calls).toHaveLength(3)
  })

  it('fulfillments and refunds read the same orders but never share a walk', async () => {
    // Both flatten 250-order pages with the same query; their row offsets
    // differ, so one list's positions (or its last page of rows) must never
    // answer the other.
    const orders = paged(300, 'orders', (i) => ({
      id: 5000 + i,
      currency: 'NOK',
      fulfillments: [{ id: 70000 + i, order_id: 5000 + i, status: 'success', line_items: [] }],
      refunds: i % 50 === 0 ? [{ id: 90000 + i, order_id: 5000 + i, refund_line_items: [], transactions: [] }] : [],
    }))
    fakeShopify((_p, params) => orders(params))
    const adapter = new ShopifyAdapter(CFG)
    await page((p) => adapter.listFulfillments(CREDS, p), 1, 2)
    await page((p) => adapter.listFulfillments(CREDS, p), 2, 2)
    // Refunds page 3 starts at row 4, exactly where fulfillments stopped: a
    // shared walk would continue from the fulfillments it holds in memory.
    const refunds = await page((p) => adapter.listRefunds(CREDS, p), 3, 2)
    expect(refunds.items.map((r) => r.id)).toEqual(['90200', '90250'])
    expect(refunds.hasMore).toBe(false)
  })

  it('an explicit cursor is still one page of orders at that position', async () => {
    const orders = paged(300, 'orders', (i) => ({
      id: 5000 + i,
      currency: 'NOK',
      fulfillments: [{ id: 70000 + i, order_id: 5000 + i, status: 'success', line_items: [] }],
      refunds: [],
    }))
    const calls = fakeShopify((_p, params) => orders(params))
    const params = withPageSink({ limit: 10, cursor: '250' })
    const items = await new ShopifyAdapter(CFG).listFulfillments(CREDS, params)
    expect(items.map((f) => f.id)).toEqual(Array.from({ length: 10 }, (_, i) => String(70250 + i)))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toEqual({ page_info: '250', limit: 10 })
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('refunds and transactions of an empty tail end the list on page 1', async () => {
    // One refund, at order 255: page 1 walks both order pages to find it.
    const orders = paged(260, 'orders', (i) => ({
      id: 5000 + i,
      currency: 'NOK',
      fulfillments: [],
      refunds: i === 255 ? [{ id: 1, order_id: 5255, refund_line_items: [], transactions: [] }] : [],
    }))
    const calls = fakeShopify((path, params) =>
      path === 'orders.json' ? orders(params) : { body: { transactions: [] } },
    )
    const adapter = new ShopifyAdapter(CFG)
    const refunds = await page((p) => adapter.listRefunds(CREDS, p), 1)
    expect(refunds.items.map((r) => r.id)).toEqual(['1'])
    expect(refunds.hasMore).toBe(false)

    _resetCursorPager()
    calls.length = 0
    const tx = await page((p) => adapter.listTransactions(CREDS, p), 1)
    expect(tx).toEqual({ items: [], hasMore: false })
    // Every order asked once for its transactions, and none has any.
    expect(calls.filter((c) => c.path === 'orders.json')).toHaveLength(2)
    expect(calls.filter((c) => c.path.endsWith('/transactions.json'))).toHaveLength(260)
  })

  it('inventory levels: the batches of locations as one stream, in pages of the limit', async () => {
    const locations = Array.from({ length: 60 }, (_, i) => ({ id: i + 1 }))
    // Batch 1 (locations 1-50) holds 300 levels; batch 2 (51-60) holds 2.
    const batch1 = paged(300, 'inventory_levels', (i) => ({
      inventory_item_id: i, location_id: 1, available: 1, updated_at: '2026-09-13T00:00:00Z',
    }), 'b1-')
    const calls = fakeShopify((path, params) => {
      if (path === 'locations.json') return { body: { locations } }
      const ids = String(params['location_ids'] ?? '')
      if (params['page_info'] != null || ids.startsWith('1,')) return batch1(params)
      return {
        body: {
          inventory_levels: [
            { inventory_item_id: 1, location_id: 51, available: 1, updated_at: '2026-09-13T00:00:00Z' },
            { inventory_item_id: 2, location_id: 60, available: 1, updated_at: '2026-09-13T00:00:00Z' },
          ],
        },
      }
    })
    const adapter = new ShopifyAdapter(CFG)
    const list = (p: ReturnType<typeof withPageSink>) => adapter.listInventoryLevels(CREDS, p)

    // It used to be one upstream page per page: 250, 50 and 2 at a limit of
    // 250, and the short middle page ended an API walk early.
    const p1 = await page(list, 1)
    const p2 = await page(list, 2)
    expect([p1.items.length, p2.items.length]).toEqual([250, 52])
    expect([p1.hasMore, p2.hasMore]).toEqual([true, false])
    const levelCalls = calls.filter((c) => c.path === 'inventory_levels.json')
    expect(levelCalls.map((c) => c.params['page_info'] ?? String(c.params['location_ids']).split(',').length)).toEqual([
      50,
      'b1-250',
      10,
    ])
  })

  it('locations: one unpaginated list, paged locally — page 2 is empty when page 1 held all', async () => {
    fakeShopify(() => ({ body: { locations: [{ id: 1 }] } }))
    const adapter = new ShopifyAdapter(CFG)
    const p1 = await page((p) => adapter.listLocations(CREDS, p), 1)
    const p2 = await page((p) => adapter.listLocations(CREDS, p), 2)
    expect(p1).toMatchObject({ hasMore: false })
    expect(p1.items).toHaveLength(1)
    expect(p2).toEqual({ items: [], hasMore: false })
  })

  it('locations: more locations than the caller’s limit are all reachable, each once', async () => {
    // The adapter declares maxPageSize 250, so the router never asks for more.
    // Answering page 2 with nothing left locations 251+ unreachable at any
    // limit; the list is sliced locally instead.
    const locations = Array.from({ length: 260 }, (_, i) => ({ id: i + 1 }))
    fakeShopify(() => ({ body: { locations } }))
    const adapter = new ShopifyAdapter(CFG)
    const p1 = await page((p) => adapter.listLocations(CREDS, p), 1)
    const p2 = await page((p) => adapter.listLocations(CREDS, p), 2)
    expect([p1.items.length, p2.items.length]).toEqual([250, 10])
    expect([p1.hasMore, p2.hasMore]).toEqual([true, false])
    expect([...p1.items, ...p2.items].map((l) => l.id)).toEqual(locations.map((l) => String(l.id)))
  })
})

describe('an explicit cursor is one upstream page at that position', () => {
  // A caller holding a `page_info` is at a position in one endpoint's chain,
  // not at a row offset, so these lists serve the page of parents there and
  // do not re-cut rows. Through the row pager the same cursor would be sized
  // at 250, or peek at the next page when the rows fill the limit exactly.
  const oneEach = (i: number) => ({
    id: 5000 + i,
    currency: 'NOK',
    fulfillments: [],
    refunds: [{ id: 90000 + i, order_id: 5000 + i, refund_line_items: [], transactions: [] }],
  })

  it('refunds', async () => {
    const orders = paged(300, 'orders', oneEach)
    const calls = fakeShopify((_p, params) => orders(params))
    const params = withPageSink({ limit: 10, cursor: '250' })
    const items = await new ShopifyAdapter(CFG).listRefunds(CREDS, params)
    expect(items.map((r) => r.id)).toEqual(Array.from({ length: 10 }, (_, i) => String(90250 + i)))
    expect(calls.map((c) => c.params)).toEqual([{ page_info: '250', limit: 10 }])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('transactions', async () => {
    const orders = paged(300, 'orders', oneEach)
    const calls = fakeShopify((path, params) => {
      if (path === 'orders.json') return orders(params)
      const id = Number(path.split('/')[1])
      return {
        body: {
          transactions: [
            { id: id * 10, order_id: id, kind: 'sale', status: 'success', amount: '1.00', currency: 'NOK', created_at: '2026-09-12T00:00:00Z' },
          ],
        },
      }
    })
    const params = withPageSink({ limit: 10, cursor: '250' })
    const items = await new ShopifyAdapter(CFG).listTransactions(CREDS, params)
    expect(items).toHaveLength(10)
    expect(calls.filter((c) => c.path === 'orders.json').map((c) => c.params)).toEqual([
      { page_info: '250', limit: 10 },
    ])
    expect(calls.filter((c) => c.path.endsWith('/transactions.json'))).toHaveLength(10)
  })

  it('variants', async () => {
    const products = paged(300, 'products', (i) => ({
      id: 1000 + i,
      title: `P${i}`,
      options: [],
      variants: [{ id: (1000 + i) * 10, product_id: 1000 + i, title: 'V', price: '1.00' }],
    }))
    const calls = fakeShopify((_p, params) => products(params))
    const params = withPageSink({ limit: 10, cursor: '250' })
    const items = await new ShopifyAdapter(CFG).listVariants(CREDS, params)
    expect(items.map((v) => v.id)).toEqual(Array.from({ length: 10 }, (_, i) => String((1250 + i) * 10)))
    expect(calls.map((c) => c.params)).toEqual([{ page_info: '250', limit: 10 }])
  })

  it('collections: one page of each endpoint at the cursor, as before', async () => {
    const custom = paged(300, 'custom_collections', (i) => ({ id: 1 + i, title: `C${i}` }))
    const smart = paged(300, 'smart_collections', (i) => ({ id: 9000 + i, title: `S${i}` }))
    const calls = fakeShopify((path, params) => (path.startsWith('custom') ? custom(params) : smart(params)))
    const params = withPageSink({ limit: 10, cursor: '250' })
    const items = await new ShopifyAdapter(CFG).listCollections(CREDS, params)
    expect(items).toHaveLength(20)
    expect(calls.map((c) => `${c.path} ${JSON.stringify(c.params)}`).sort()).toEqual([
      'custom_collections.json {"page_info":"250","limit":10}',
      'smart_collections.json {"page_info":"250","limit":10}',
    ])
  })
})

describe('what a walk of rows is keyed by', () => {
  // The row pager serves a caller's next page from the upstream page it
  // already holds, with no request. Whatever its key leaves out shares
  // those rows, so each of these asks upstream on its own.
  const everyOrder = (i: number) => ({
    id: 5000 + i,
    currency: 'NOK',
    fulfillments: [{ id: 70000 + i, order_id: 5000 + i, status: 'success', line_items: [] }],
    refunds: [],
  })

  it('fulfillments: two shops, and two installs on one shop', async () => {
    const orders = paged(300, 'orders', everyOrder)
    const calls = fakeShopify((_p, params) => orders(params))
    const adapter = new ShopifyAdapter(CFG)
    await adapter.listFulfillments(shopCreds('acme'), withPageSink({ page: 1, limit: 2 }))
    await adapter.listFulfillments(shopCreds('other'), withPageSink({ page: 2, limit: 2 }))
    expect(calls).toHaveLength(2)
    // The same shop, another install: its token may not see the same orders.
    const install = { accessToken: 'tok-second-install', extra: { shop: 'acme' } }
    await adapter.listFulfillments(install, withPageSink({ page: 2, limit: 2 }))
    expect(calls).toHaveLength(3)
    // The first install again: its walk is still there.
    await adapter.listFulfillments(shopCreds('acme'), withPageSink({ page: 2, limit: 2 }))
    expect(calls).toHaveLength(3)
  })

  it('collections: two shops', async () => {
    const custom = paged(30, 'custom_collections', (i) => ({ id: 1 + i, title: `C${i}` }))
    const smart = paged(3, 'smart_collections', (i) => ({ id: 9000 + i, title: `S${i}` }))
    const calls = fakeShopify((path, params) => (path.startsWith('custom') ? custom(params) : smart(params)))
    const adapter = new ShopifyAdapter(CFG)
    await adapter.listCollections(shopCreds('acme'), withPageSink({ page: 1, limit: 2 }))
    const before = calls.length
    await adapter.listCollections(shopCreds('other'), withPageSink({ page: 2, limit: 2 }))
    // `other` starts from its own first page, not from the page acme peeked at.
    expect(calls[before]?.params['page_info']).toBeUndefined()
  })

  it('an incremental walk and an unfiltered one never share rows', async () => {
    const orders = paged(300, 'orders', everyOrder)
    const custom = paged(30, 'custom_collections', (i) => ({ id: 1 + i, title: `C${i}` }))
    const calls = fakeShopify((path, params) => (path === 'orders.json' ? orders(params) : custom(params)))
    const adapter = new ShopifyAdapter(CFG)
    const since = new Date('2026-09-01T00:00:00Z')
    // The first request each call makes: an incremental page 2 has no rows
    // of its own in hand, so it asks upstream with its filter.
    const firstRequest = async (call: () => Promise<unknown>) => {
      const before = calls.length
      await call()
      const c = calls[before]
      return c ? `${c.path} ${c.params['updated_at_min'] ?? '-'}` : 'none'
    }
    const seen = [
      await firstRequest(() => adapter.listFulfillments(CREDS, withPageSink({ page: 1, limit: 2 }))),
      await firstRequest(() =>
        adapter.listFulfillments(CREDS, withPageSink({ page: 2, limit: 2, updatedAfter: since })),
      ),
      await firstRequest(() => adapter.listCollections(CREDS, withPageSink({ page: 1, limit: 2 }))),
      await firstRequest(() =>
        adapter.listCollections(CREDS, withPageSink({ page: 2, limit: 2, updatedAfter: since })),
      ),
    ]
    expect(seen).toEqual([
      'orders.json -',
      'orders.json 2026-09-01T00:00:00.000Z',
      'custom_collections.json -',
      'custom_collections.json 2026-09-01T00:00:00.000Z',
    ])
  })
})

describe('sparse rows', () => {
  // 1,001 pages of 250 orders with nothing to flatten, then one order with
  // one fulfillment and one refund. The default budget of 1,000 upstream
  // pages would throw on page 1.
  const empty = Array.from({ length: 250 }, (_, i) => ({ id: i, currency: 'NOK', fulfillments: [], refunds: [] }))
  const last = [
    {
      id: 9_999_999,
      currency: 'NOK',
      fulfillments: [{ id: 1, order_id: 9_999_999, status: 'success', line_items: [] }],
      refunds: [{ id: 2, order_id: 9_999_999, refund_line_items: [], transactions: [] }],
    },
  ]
  const sparseOrders = () =>
    fakeShopify((_p, params) => {
      const n = params['page_info'] != null ? Number(params['page_info']) : 0
      return n < 1001 ? { body: { orders: empty }, next: String(n + 1) } : { body: { orders: last } }
    })

  it('fulfillments rarer than one in 250,000 orders still answer page 1', async () => {
    const calls = sparseOrders()
    const p1 = await page((p) => new ShopifyAdapter(CFG).listFulfillments(CREDS, p), 1, 10)
    expect(p1).toEqual({ items: [expect.objectContaining({ id: '1' })], hasMore: false })
    expect(calls).toHaveLength(1002)
  })

  it('refunds rarer than one in 250,000 orders still answer page 1', async () => {
    const calls = sparseOrders()
    const p1 = await page((p) => new ShopifyAdapter(CFG).listRefunds(CREDS, p), 1, 10)
    expect(p1).toEqual({ items: [expect.objectContaining({ id: '2' })], hasMore: false })
    expect(calls).toHaveLength(1002)
  })
})
