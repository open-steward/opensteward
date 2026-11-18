/**
 * Alibaba.com adapter: request shapes, paging and refusals, against a fake
 * gateway that honours only each API's documented parameters (fake-alibaba.ts).
 *
 * Paging sources (first-party getApi.json references):
 *   /alibaba/icbu/product/list (cid=1): "Pagination is supported, with a
 *     maximum of 30 per page."; params current_page, page_size; output
 *     result.total_item "the total count of the result".
 *   /alibaba/order/list (cid=8): start_page "Default Value:0"; page_size
 *     "Default Value:10,The maximum number of pages is 100."; role
 *     "seller/buyer， default buyer" (required); value.total_count "total
 *     record count"; modified_date_start "Modify the time starting from the
 *     date_str time zone, which is America/Los_Angeles." { date_str "format is
 *     (yyyy-MM-dd HH:mm:ss)" }.
 *   /icbu/product/inventory/get, /order/logistics/query and the category APIs
 *     take no paging parameters.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import {
  AlibabaAdapter,
  losAngelesDateStr,
} from '../../../../../../src/verticals/ecommerce/adapters/alibaba/index'
import { CREDS, fakeAlibaba, intParam, type Handler } from './fake-alibaba'
import {
  CATEGORY_GET_NEW,
  CATEGORY_LIST_V2,
  INVENTORY_GET,
  LOGISTICS_QUERY,
  ORDER_GET,
  PRODUCT_GET_V2,
  PRODUCT_LIST,
} from './fixtures'

const adapter = new AlibabaAdapter()

beforeEach(() => {
  _resetCursorPager()
})
afterEach(() => {
  vi.restoreAllMocks()
})

// ── Fake collections ─────────────────────────────────────────────────────────

const productRow = PRODUCT_LIST.result.products[0]!

/** product.list over `n` products, ids p1..pn. */
function productList(n: number): Handler {
  return (params) => {
    const page = intParam(params, 'current_page', 1, 1)
    const size = intParam(params, 'page_size', 20, 1, 30)
    const all = Array.from({ length: n }, (_, i) => ({ ...productRow, id: `p${i + 1}` }))
    return {
      result: {
        curr_page: String(page),
        page_size: String(size),
        total_item: String(n),
        products: all.slice((page - 1) * size, page * size),
      },
    }
  }
}

const orderRow = {
  trade_id: '',
  trade_status: 'unpay',
  create_date: { timestamp: '1754021376000' },
  modify_date: { timestamp: '1754021377000' },
}

/** order.list over `n` seller orders, ids o1..on, modify times 1..n days after 2025-01-01. */
function orderList(n: number): Handler {
  const base = Date.UTC(2025, 0, 1)
  return (params) => {
    if (params['role'] !== 'seller') return { value: { total_count: '0', order_list: [] } }
    const start = intParam(params, 'start_page', 0, 0)
    const size = intParam(params, 'page_size', 10, 1, 100)
    let all = Array.from({ length: n }, (_, i) => ({
      ...orderRow,
      trade_id: `o${i + 1}`,
      modify_date: { timestamp: String(base + (i + 1) * 86_400_000) },
    }))
    if (params['modified_date_start'] !== undefined) {
      const { date_str } = JSON.parse(params['modified_date_start']) as { date_str: string }
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(date_str)) throw new Error('bad date_str')
      all = all.filter(
        (o) => losAngelesDateStr(new Date(Number(o.modify_date.timestamp))) >= date_str,
      )
    }
    return {
      value: {
        total_count: String(all.length),
        order_list: all.slice(start * size, (start + 1) * size),
      },
    }
  }
}

/** Walk pages 1.. at `limit`, returning the ids of each page and the hasMore reported. */
async function walk<T extends { id: string }>(
  list: (p: QueryParams) => Promise<T[]>,
  limit: number,
  extra: Partial<QueryParams> = {},
): Promise<{ pages: string[][]; hasMore: (boolean | undefined)[] }> {
  const pages: string[][] = []
  const hasMore: (boolean | undefined)[] = []
  for (let page = 1; page <= 50; page++) {
    const params = withPageSink({ page, limit, ...extra } as QueryParams)
    const rows = await list(params)
    pages.push(rows.map((r) => r.id))
    const more = readUpstreamPage(params)?.hasMore
    hasMore.push(more)
    if (!more) break
  }
  return { pages, hasMore }
}

function expectEachOnce(pages: string[][], expected: string[]): void {
  const flat = pages.flat()
  expect(new Set(flat).size).toBe(flat.length)
  expect(flat).toEqual(expected)
}

// ── Products ─────────────────────────────────────────────────────────────────

describe('alibaba listProducts', () => {
  it('walks 2L+1 products one current_page at a time with exact hasMore', async () => {
    const L = 3
    const sent = fakeAlibaba({ '/alibaba/icbu/product/list': productList(2 * L + 1) })
    const { pages, hasMore } = await walk((p) => adapter.listProducts(CREDS, p), L)
    expect(pages).toEqual([['p1', 'p2', 'p3'], ['p4', 'p5', 'p6'], ['p7']])
    expect(hasMore).toEqual([true, true, false])
    expect(sent.map((c) => [c.path, c.params['current_page'], c.params['page_size']])).toEqual([
      ['/alibaba/icbu/product/list', '1', '3'],
      ['/alibaba/icbu/product/list', '2', '3'],
      ['/alibaba/icbu/product/list', '3', '3'],
    ])
  })

  it('ends exactly when total_item is a multiple of the page size', async () => {
    fakeAlibaba({ '/alibaba/icbu/product/list': productList(6) })
    const { pages, hasMore } = await walk((p) => adapter.listProducts(CREDS, p), 3)
    expect(pages).toEqual([
      ['p1', 'p2', 'p3'],
      ['p4', 'p5', 'p6'],
    ])
    expect(hasMore).toEqual([true, false])
  })

  it('clamps page_size to the documented 30 and reports the size it sent', async () => {
    const sent = fakeAlibaba({ '/alibaba/icbu/product/list': productList(70) })
    const params = withPageSink({ page: 2, limit: 50 } as QueryParams)
    const rows = await adapter.listProducts(CREDS, params)
    expect(sent[0]!.params).toMatchObject({ current_page: '2', page_size: '30' })
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 30 }, (_, i) => `p${31 + i}`))
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 30, totalCount: 70, hasMore: true })
  })

  it('serves the documented product.list response as it is, error_code and error_msg included', async () => {
    // The documented example fills error_code "system error" and error_msg
    // "please try again later" beside a normal products[] row.
    fakeAlibaba({ '/alibaba/icbu/product/list': () => PRODUCT_LIST })
    const params = withPageSink({ page: 1, limit: 20 } as QueryParams)
    const rows = await adapter.listProducts(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['188909844009'])
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 200, hasMore: true })
  })

  it('refuses a product.list page without the documented total_item', async () => {
    const { total_item: _omit, ...noTotal } = PRODUCT_LIST.result
    fakeAlibaba({ '/alibaba/icbu/product/list': () => ({ result: noTotal }) })
    await expect(
      adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 5 } as QueryParams)),
    ).rejects.toThrow(/no total_item \(error_code system error/)
  })

  it('without a limit sends the documented 30 and reports that size', async () => {
    const sent = fakeAlibaba({ '/alibaba/icbu/product/list': productList(100) })
    const params = withPageSink({ page: 2 } as QueryParams)
    expect(await adapter.listProducts(CREDS, params)).toHaveLength(30)
    expect(sent[0]!.params['page_size']).toBe('30')
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 30, totalCount: 100, hasMore: true })
  })

  it('getProduct throws when get/v2 reports success false', async () => {
    fakeAlibaba({
      '/alibaba/icbu/product/get/v2': () => ({
        ...PRODUCT_GET_V2,
        success: false,
        msg_code: 'X',
        message: 'nope',
      }),
    })
    await expect(adapter.getProduct(CREDS, '1')).rejects.toThrow(/X nope/)
  })

  it('getProduct reads get/v2 by product_id', async () => {
    const sent = fakeAlibaba({ '/alibaba/icbu/product/get/v2': () => PRODUCT_GET_V2 })
    const p = await adapter.getProduct(CREDS, '1601449197602')
    expect(sent.map((c) => [c.path, c.params['product_id']])).toEqual([
      ['/alibaba/icbu/product/get/v2', '1601449197602'],
    ])
    expect(p.id).toBe('1601449197602')
  })

  it('throws on a gateway error instead of returning an empty page', async () => {
    fakeAlibaba({})
    await expect(adapter.listProducts(CREDS, { page: 1, limit: 5 } as QueryParams)).rejects.toThrow(
      /InvalidApiPath/,
    )
  })
})

// ── Orders ───────────────────────────────────────────────────────────────────

describe('alibaba listOrders', () => {
  it('walks 2L+1 seller orders with start_page = page - 1 and exact hasMore', async () => {
    const L = 4
    const sent = fakeAlibaba({ '/alibaba/order/list': orderList(2 * L + 1) })
    const { pages, hasMore } = await walk((p) => adapter.listOrders(CREDS, p), L)
    expectEachOnce(
      pages,
      Array.from({ length: 2 * L + 1 }, (_, i) => `o${i + 1}`),
    )
    expect(pages.map((p) => p.length)).toEqual([4, 4, 1])
    expect(hasMore).toEqual([true, true, false])
    expect(
      sent.map((c) => [c.params['role'], c.params['start_page'], c.params['page_size']]),
    ).toEqual([
      ['seller', '0', '4'],
      ['seller', '1', '4'],
      ['seller', '2', '4'],
    ])
  })

  it('ends exactly when total_count is a multiple of the page size', async () => {
    fakeAlibaba({ '/alibaba/order/list': orderList(8) })
    const { pages, hasMore } = await walk((p) => adapter.listOrders(CREDS, p), 4)
    expect(pages.map((p) => p.length)).toEqual([4, 4])
    expect(hasMore).toEqual([true, false])
  })

  it('clamps page_size to 100 and reports it', async () => {
    const sent = fakeAlibaba({ '/alibaba/order/list': orderList(250) })
    const params = withPageSink({ page: 1, limit: 500 } as QueryParams)
    expect(await adapter.listOrders(CREDS, params)).toHaveLength(100)
    expect(sent[0]!.params['page_size']).toBe('100')
    expect(readUpstreamPage(params)).toMatchObject({
      pageSize: 100,
      hasMore: true,
      totalCount: 250,
    })
  })

  it('sends updatedAfter as modified_date_start.date_str in America/Los_Angeles', async () => {
    const sent = fakeAlibaba({ '/alibaba/order/list': orderList(10) })
    // 2025-01-06T08:00:00Z is 2025-01-06 00:00:00 in Los Angeles (PST, UTC-8); o5 was
    // modified at 2025-01-06T00:00Z (Jan 5, 16:00 there), o6 at 2025-01-07T00:00Z.
    const updatedAfter = new Date('2025-01-06T08:00:00Z')
    const rows = await adapter.listOrders(CREDS, {
      page: 1,
      limit: 50,
      updatedAfter,
    } as QueryParams)
    expect(JSON.parse(sent[0]!.params['modified_date_start']!)).toEqual({
      date_str: '2025-01-06 00:00:00',
    })
    expect(rows.map((o) => o.id)).toEqual(['o6', 'o7', 'o8', 'o9', 'o10'])
  })

  it('getOrder reads order/get by e_trade_id', async () => {
    const sent = fakeAlibaba({ '/alibaba/order/get': () => ORDER_GET })
    const o = await adapter.getOrder(CREDS, '234193410001028893')
    expect(sent[0]!.params['e_trade_id']).toBe('234193410001028893')
    expect(o.totalPrice).toEqual({ amount: 487, currency: 'USD' })
  })
})

// ── Fulfillments ─────────────────────────────────────────────────────────────

/** Shipments per order: uneven, with orders that have none. */
const SHIPMENTS = [2, 0, 3, 1, 0, 0, 4, 1, 2, 0, 1, 3, 0]

function logistics(): Handler {
  return (params) => {
    const n = SHIPMENTS[Number(params['trade_id']!.slice(1)) - 1]
    if (n === undefined) throw new Error('no such order')
    return {
      value: {
        ...LOGISTICS_QUERY.value,
        shipping_order_list: Array.from({ length: n }, (_, i) => ({
          voucher: { tracking_number: `${params['trade_id']}-t${i}` },
        })),
      },
    }
  }
}

/** Shipments of the orders modified on or after 2025-01-06 00:00:00 Los Angeles (o6..o13). */
const FILTERED_SHIPMENTS = SHIPMENTS.flatMap((n, o) =>
  o >= 5 ? Array.from({ length: n }, (_, i) => `o${o + 1}:${i}`) : [],
)

describe('alibaba listFulfillments', () => {
  it('flattens shipments out of order pages and serves every one once (2L+1)', async () => {
    // 13 orders at the order list's 10 per page → an uneven second page; 17 shipments.
    const total = SHIPMENTS.reduce((a, b) => a + b, 0)
    const L = (total - 1) / 2
    expect(Number.isInteger(L)).toBe(true)
    const sent = fakeAlibaba({
      '/alibaba/order/list': orderList(SHIPMENTS.length),
      '/order/logistics/query': logistics(),
    })
    const { pages, hasMore } = await walk((p) => adapter.listFulfillments(CREDS, p), L)
    const expected = SHIPMENTS.flatMap((n, o) =>
      Array.from({ length: n }, (_, i) => `o${o + 1}:${i}`),
    )
    expectEachOnce(pages, expected)
    expect(pages.map((p) => p.length)).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
    const lists = sent.filter((c) => c.path === '/alibaba/order/list')
    expect(lists.map((c) => [c.params['start_page'], c.params['page_size']])).toEqual([
      ['0', '10'],
      ['1', '10'],
    ])
    const queries = sent.filter((c) => c.path === '/order/logistics/query')
    expect(queries.every((c) => c.params['data_select'] === 'logistic_order')).toBe(true)
  })

  it('sends updatedAfter on every order page and serves only the filtered shipments', async () => {
    const sent = fakeAlibaba({
      '/alibaba/order/list': orderList(SHIPMENTS.length),
      '/order/logistics/query': logistics(),
    })
    // 2025-01-06 00:00:00 in Los Angeles: orders o6..o13 match.
    const updatedAfter = new Date('2025-01-06T08:00:00Z')
    const { pages, hasMore } = await walk((p) => adapter.listFulfillments(CREDS, p), 5, {
      updatedAfter,
    })
    expectEachOnce(pages, FILTERED_SHIPMENTS)
    expect(hasMore).toEqual([true, true, false])
    const lists = sent.filter((c) => c.path === '/alibaba/order/list')
    expect(lists.length).toBeGreaterThan(0)
    for (const c of lists) {
      expect(JSON.parse(c.params['modified_date_start']!)).toEqual({
        date_str: '2025-01-06 00:00:00',
      })
    }
  })

  it('keeps filtered and unfiltered walks apart', async () => {
    fakeAlibaba({
      '/alibaba/order/list': orderList(SHIPMENTS.length),
      '/order/logistics/query': logistics(),
    })
    await adapter.listFulfillments(CREDS, withPageSink({ page: 1, limit: 5 } as QueryParams))
    const rows = await adapter.listFulfillments(
      CREDS,
      withPageSink({
        page: 2,
        limit: 5,
        updatedAfter: new Date('2025-01-06T08:00:00Z'),
      } as QueryParams),
    )
    expect(rows.map((f) => f.id)).toEqual(FILTERED_SHIPMENTS.slice(5, 10))
  })

  it('stops at an order total that is an exact multiple of the page, with no extra request', async () => {
    const sent = fakeAlibaba({
      '/alibaba/order/list': orderList(20),
      '/order/logistics/query': (params) => ({
        value: {
          ...LOGISTICS_QUERY.value,
          shipping_order_list: [{ voucher: { tracking_number: `${params['trade_id']}-t0` } }],
        },
      }),
    })
    const { pages, hasMore } = await walk((p) => adapter.listFulfillments(CREDS, p), 10)
    expect(pages.map((p) => p.length)).toEqual([10, 10])
    expect(hasMore).toEqual([true, false])
    expect(sent.filter((c) => c.path === '/alibaba/order/list')).toHaveLength(2)
  })

  it('refuses to go past a page of orders that lacks the documented total_count', async () => {
    fakeAlibaba({
      '/alibaba/order/list': () => ({ value: { order_list: [{ ...orderRow, trade_id: 'o1' }] } }),
      '/order/logistics/query': logistics(),
    })
    await expect(
      adapter.listFulfillments(CREDS, withPageSink({ page: 1, limit: 5 } as QueryParams)),
    ).rejects.toThrow(/total_count/)
  })

  it('an empty order page ends the walk', async () => {
    fakeAlibaba({ '/alibaba/order/list': () => ({ value: { order_list: [] } }) })
    const params = withPageSink({ page: 1, limit: 5 } as QueryParams)
    expect(await adapter.listFulfillments(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('getFulfillment reads the shipment back by trade_id and index', async () => {
    const sent = fakeAlibaba({ '/order/logistics/query': logistics() })
    const f = await adapter.getFulfillment(CREDS, 'o3:2')
    expect(sent[0]!.params['trade_id']).toBe('o3')
    expect(f).toMatchObject({ id: 'o3:2', orderId: 'o3', trackingNumber: 'o3-t2' })
    await expect(adapter.getFulfillment(CREDS, 'o3:9')).rejects.toThrow(/no shipment/)
  })
})

// ── Inventory ────────────────────────────────────────────────────────────────

const invRow = INVENTORY_GET.result.data_list[0]!
/** Inventory rows per product (35 products → product.list pages of 30 and 5). */
const ROWS = Array.from({ length: 35 }, (_, i) => [1, 0, 2, 3][i % 4]!)

function inventoryGet(): Handler {
  return (params) => {
    if (!params['language']) throw new Error('language is required')
    const n = ROWS[Number(params['product_id']!.slice(1)) - 1]
    if (n === undefined) throw new Error('no such product')
    return {
      result: {
        ...INVENTORY_GET.result,
        success: 'true',
        data_list: Array.from({ length: n }, (_, i) => ({
          ...invRow,
          sku_id: `${params['product_id']}-s${i}`,
        })),
      },
    }
  }
}

describe('alibaba listInventoryLevels', () => {
  it('flattens SKU rows across the 30-product page boundary, every one once', async () => {
    const total = ROWS.reduce((a, b) => a + b, 0) // 51
    const L = 20
    const sent = fakeAlibaba({
      '/alibaba/icbu/product/list': productList(ROWS.length),
      '/icbu/product/inventory/get': inventoryGet(),
    })
    const { pages, hasMore } = await walk((p) => adapter.listInventoryLevels(CREDS, p), L)
    const expected = ROWS.flatMap((n, p) =>
      Array.from({ length: n }, (_, i) => `p${p + 1}-s${i}:CN_LOCAL_01`),
    )
    expect(expected).toHaveLength(total)
    expectEachOnce(pages, expected)
    expect(pages.map((p) => p.length)).toEqual([20, 20, 11])
    expect(hasMore).toEqual([true, true, false])
    const lists = sent.filter((c) => c.path === '/alibaba/icbu/product/list')
    expect(lists.map((c) => [c.params['current_page'], c.params['page_size']])).toEqual([
      ['1', '30'],
      ['2', '30'],
    ])
    const gets = sent.filter((c) => c.path === '/icbu/product/inventory/get')
    expect(gets.every((c) => c.params['language'] === 'en_US')).toBe(true)
  })

  it('2L+1 exactly: 7 rows at limit 3', async () => {
    fakeAlibaba({
      '/alibaba/icbu/product/list': productList(4),
      '/icbu/product/inventory/get': (params) => ({
        result: {
          success: 'true',
          data_list: Array.from(
            { length: [3, 0, 1, 3][Number(params['product_id']!.slice(1)) - 1]! },
            (_, i) => ({
              ...invRow,
              sku_id: `${params['product_id']}-${i}`,
            }),
          ),
        },
      }),
    })
    const { pages, hasMore } = await walk((p) => adapter.listInventoryLevels(CREDS, p), 3)
    expect(pages.map((p) => p.length)).toEqual([3, 3, 1])
    expect(hasMore).toEqual([true, true, false])
    expectEachOnce(
      pages,
      ['p1-0', 'p1-1', 'p1-2', 'p3-0', 'p4-0', 'p4-1', 'p4-2'].map((s) => `${s}:CN_LOCAL_01`),
    )
  })

  it('stops at a product total that is an exact multiple of 30, with no extra request', async () => {
    const sent = fakeAlibaba({
      '/alibaba/icbu/product/list': productList(30),
      '/icbu/product/inventory/get': (params) => ({
        result: {
          success: 'true',
          data_list: [{ ...invRow, sku_id: `${params['product_id']}-s0` }],
        },
      }),
    })
    const { pages, hasMore } = await walk((p) => adapter.listInventoryLevels(CREDS, p), 15)
    expect(pages.map((p) => p.length)).toEqual([15, 15])
    expect(hasMore).toEqual([true, false])
    expect(sent.filter((c) => c.path === '/alibaba/icbu/product/list')).toHaveLength(1)
  })

  it('refuses a product.list page without the documented total_item', async () => {
    fakeAlibaba({
      '/alibaba/icbu/product/list': () => ({ result: { products: [{ ...productRow, id: 'p1' }] } }),
      '/icbu/product/inventory/get': inventoryGet(),
    })
    await expect(
      adapter.listInventoryLevels(CREDS, withPageSink({ page: 1, limit: 5 } as QueryParams)),
    ).rejects.toThrow(/no total_item/)
  })

  it('throws when inventory.get reports success false', async () => {
    fakeAlibaba({
      '/alibaba/icbu/product/list': productList(1),
      '/icbu/product/inventory/get': () => ({
        result: { success: 'false', msg_code: 'X', message_info: 'nope' },
      }),
    })
    await expect(
      adapter.listInventoryLevels(CREDS, withPageSink({ page: 1, limit: 5 } as QueryParams)),
    ).rejects.toThrow(/X nope/)
  })

  it('getInventoryLevel returns the row of the asked inventory_code, not another warehouse', async () => {
    fakeAlibaba({
      '/alibaba/icbu/product/get/v2': () => ({
        ...PRODUCT_GET_V2,
        product_info: { ...PRODUCT_GET_V2.product_info, basic_info: { product_id: 'p1' } },
      }),
      '/icbu/product/inventory/get': () => ({
        result: {
          success: 'true',
          data_list: [
            { ...invRow, sku_id: 's1', inventory_code: 'CN_LOCAL_01', inventory: '100' },
            { ...invRow, sku_id: 's1', inventory_code: 'US_02', inventory: '7' },
          ],
        },
      }),
    })
    const l = await adapter.getInventoryLevel(CREDS, 's1:US_02')
    expect(l).toMatchObject({ id: 's1:US_02', locationId: 'US_02', available: 7 })
    await expect(adapter.getInventoryLevel(CREDS, 's1:XX')).rejects.toThrow(/no inventory row/)
  })

  it('getInventoryLevel finds the product by sku_id, then its row', async () => {
    const sent = fakeAlibaba({
      '/alibaba/icbu/product/get/v2': (params) => ({
        ...PRODUCT_GET_V2,
        product_info: { ...PRODUCT_GET_V2.product_info, basic_info: { product_id: 'p3' } },
        _sku: params['sku_id'],
      }),
      '/icbu/product/inventory/get': inventoryGet(),
    })
    const l = await adapter.getInventoryLevel(CREDS, 'p3-s1:CN_LOCAL_01')
    expect(sent.map((c) => [c.path, c.params['sku_id'] ?? c.params['product_id']])).toEqual([
      ['/alibaba/icbu/product/get/v2', 'p3-s1'],
      ['/icbu/product/inventory/get', 'p3'],
    ])
    expect(l).toMatchObject({ id: 'p3-s1:CN_LOCAL_01', variantId: 'p3-s1', available: 100 })
  })
})

// ── Collections ──────────────────────────────────────────────────────────────

describe('alibaba listCollections', () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({
    ...CATEGORY_LIST_V2.data[0],
    category_id: String(i + 1),
  }))

  it('lists the first-level categories (no parent_category_id) and slices them locally', async () => {
    const sent = fakeAlibaba({
      '/alibaba/icbu/category/get/v2': () => ({ ...CATEGORY_LIST_V2, data: rows }),
    })
    const { pages, hasMore } = await walk((p) => adapter.listCollections(CREDS, p), 3)
    expect(pages).toEqual([['1', '2', '3'], ['4', '5', '6'], ['7']])
    expect(hasMore).toEqual([true, true, false])
    expect(sent.every((c) => c.params['parent_category_id'] === undefined)).toBe(true)
  })

  it('throws when the API reports success false', async () => {
    fakeAlibaba({
      '/alibaba/icbu/category/get/v2': () => ({ success: 'false', msg_code: 'X', message: 'nope' }),
    })
    await expect(
      adapter.listCollections(CREDS, { page: 1, limit: 3 } as QueryParams),
    ).rejects.toThrow(/X nope/)
  })

  it('getCollection reads category.get.new by cat_id', async () => {
    const sent = fakeAlibaba({ '/icbu/product/category/get': () => CATEGORY_GET_NEW })
    const c = await adapter.getCollection(CREDS, '127686030')
    expect(sent[0]!.params['cat_id']).toBe('127686030')
    expect(c.title).toBe('Air Conditioning Systems')
  })
})

// ── Refusals ─────────────────────────────────────────────────────────────────

describe('alibaba refusals', () => {
  it.each([
    ['listCustomers', () => adapter.listCustomers(CREDS, { page: 1, limit: 10 } as QueryParams)],
    ['getCustomer', () => adapter.getCustomer(CREDS, 'x')],
    ['createProduct', () => adapter.createProduct(CREDS, {})],
    ['updateProduct', () => adapter.updateProduct(CREDS, '1', {})],
    ['deleteProduct', () => adapter.deleteProduct(CREDS, '1')],
    ['cancelOrder', () => adapter.cancelOrder(CREDS, '1')],
    [
      'setInventoryLevel',
      () => adapter.setInventoryLevel(CREDS, { variantId: '1', locationId: 'l', available: 1 }),
    ],
  ])('%s throws 501 NOT_SUPPORTED and sends nothing', async (_name, call) => {
    const sent = fakeAlibaba({})
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(sent).toEqual([])
  })
})
