/**
 * The three Tmall lists that called TOP method names the TOP docs do not know:
 *
 * - listProducts called `tmall.item.seller.list.get`; now
 *   `taobao.items.onsale.get` (docId 18): page_no, page_size (max 200,
 *   default 40), `total_results`, list under `items.item`.
 * - listFulfillments / getFulfillment called `taobao.logistics.orders.list.get`
 *   and `taobao.logistics.order.get`; now `taobao.logistics.orders.get`
 *   (docId 235): page_no, page_size (default 40), `tid`, `total_results`, list
 *   under `shippings.shipping`.
 * - listInventoryLevels / getInventoryLevel called `tmall.inventory.list.get`;
 *   TOP has no unscoped inventory list, so both refuse with 501 before any
 *   request.
 *
 * The fake honours ONLY the documented parameters of each method and answers
 * any other method name with the TOP "Invalid method" error.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { TmallAdapter } from '../../../../../../src/verticals/ecommerce/adapters/tmall/index'
import { ProductSchema } from '../../../../../../src/verticals/ecommerce/schema/product'
import { FulfillmentSchema } from '../../../../../../src/verticals/ecommerce/schema/fulfillment'

const CREDS = {
  accessToken: 'session-tok',
  refreshToken: 'refresh-tok',
  extra: { appKey: 'key123', appSecret: 'secret456', userId: 'seller1' },
}

interface Shop {
  items?: number
  shippings?: number
  /** shippings per tid for the `tid` filter; default one */
  splitTid?: Record<string, string[]>
  /** exact on-sale rows to answer page 1 with, in place of generated ones */
  itemRows?: Record<string, unknown>[]
}

/**
 * docId 18 order_by: "排序方式。格式为column:asc/desc ，column可选值:list_time(上架时间),
 * delist_time(下架时间),num(商品数量)，modified(最近修改时间)，sold_quantity（商品销量）"
 */
const ONSALE_ORDER_BY = /^(list_time|delist_time|num|modified|sold_quantity):(asc|desc)$/

const ONSALE_PARAMS = new Set([
  'fields',
  'q',
  'cid',
  'seller_cids',
  'page_no',
  'page_size',
  'order_by',
  'has_discount',
  'has_showcase',
  'is_taobao',
  'is_ex',
  'start_modified',
  'end_modified',
  'is_cspu',
  'is_combine',
  'auction_type',
])
const LOGISTICS_PARAMS = new Set([
  'fields',
  'tid',
  'buyer_nick',
  'status',
  'seller_confirm',
  'receiver_name',
  'start_created',
  'end_created',
  'freight_payer',
  'type',
  'page_no',
  'page_size',
  'ouid',
])
const PUBLIC_PARAMS = new Set([
  'method',
  'app_key',
  'session',
  'timestamp',
  'v',
  'sign_method',
  'sign',
  'format',
  'simplify',
  'partner_id',
  'target_app_key',
])

function fakeTop(shop: Shop): URLSearchParams[] {
  const calls: URLSearchParams[] = []
  const invalid = (msg: string) => ({ data: { error_response: { code: 41, msg } } })
  const post = vi.fn(async (_url: string, body: string) => {
    const p = new URLSearchParams(body)
    calls.push(p)
    const method = p.get('method')
    const allowed =
      method === 'taobao.items.onsale.get'
        ? ONSALE_PARAMS
        : method === 'taobao.logistics.orders.get'
          ? LOGISTICS_PARAMS
          : undefined
    if (!allowed) return { data: { error_response: { code: 22, msg: 'Invalid method' } } }
    for (const k of p.keys()) {
      if (!allowed.has(k) && !PUBLIC_PARAMS.has(k)) return invalid(`Invalid arguments:${k}`)
    }
    const size = p.get('page_size') === null ? 40 : Number(p.get('page_size'))
    const pageNo = p.get('page_no') === null ? 1 : Number(p.get('page_no'))
    if (method === 'taobao.items.onsale.get') {
      if (!Number.isInteger(size) || size < 1 || size > 200)
        return invalid('Invalid arguments:page_size')
      const orderBy = p.get('order_by')
      if (orderBy !== null && !ONSALE_ORDER_BY.test(orderBy))
        return invalid('Invalid arguments:order_by')
      if (shop.itemRows) {
        const rows = pageNo === 1 ? shop.itemRows : []
        return {
          data: {
            items_onsale_get_response: {
              total_results: shop.itemRows.length,
              items: { item: rows },
            },
          },
        }
      }
      const total = shop.items ?? 0
      const start = (pageNo - 1) * size
      const item = []
      for (let i = start + 1; i <= Math.min(start + size, total); i++) {
        item.push({ num_iid: i, title: `item ${i}`, approve_status: 'onsale' })
      }
      return { data: { items_onsale_get_response: { total_results: total, items: { item } } } }
    }
    // taobao.logistics.orders.get
    const tid = p.get('tid')
    if (tid !== null) {
      const codes = shop.splitTid?.[tid] ?? []
      const shipping = codes.map((c) => ({ tid: Number(tid), order_code: c, status: 'PICK_UP' }))
      return {
        data: {
          logistics_orders_get_response: {
            total_results: shipping.length,
            shippings: { shipping },
          },
        },
      }
    }
    const total = shop.shippings ?? 0
    const start = (pageNo - 1) * size
    const shipping = []
    for (let i = start + 1; i <= Math.min(start + size, total); i++) {
      shipping.push({ tid: 1000 + i, order_code: `LP${i}`, status: 'CREATED', out_sid: `S${i}` })
    }
    return {
      data: { logistics_orders_get_response: { total_results: total, shippings: { shipping } } },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
  return calls
}

afterEach(() => vi.restoreAllMocks())

type ListFn = (a: TmallAdapter, p: QueryParams) => Promise<{ id: string }[]>
const listProducts: ListFn = (a, p) => a.listProducts(CREDS, p)
const listFulfillments: ListFn = (a, p) => a.listFulfillments(CREDS, p)

async function walk(list: ListFn, limit: number, pages: number) {
  const adapter = new TmallAdapter()
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const sizes: number[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    const rows = await list(adapter, params)
    ids.push(...rows.map((r) => r.id))
    sizes.push(rows.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, sizes }
}

const productIds = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))
const fulfillmentIds = (n: number) =>
  Array.from({ length: n }, (_, i) => `${1000 + i + 1}:LP${i + 1}`)

describe.each([
  ['listProducts', listProducts, 'taobao.items.onsale.get', 'items', productIds],
  [
    'listFulfillments',
    listFulfillments,
    'taobao.logistics.orders.get',
    'shippings',
    fulfillmentIds,
  ],
] as const)('Tmall %s', (_name, list, method, field, ids) => {
  it(`calls ${method} and serves 2L+1 rows over three pages, each once, hasMore exact`, async () => {
    const calls = fakeTop({ [field]: 7 })
    const r = await walk(list, 3, 3)
    expect(r.ids).toEqual(ids(7))
    expect(r.sizes).toEqual([3, 3, 1])
    expect(r.hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.get('method'))).toEqual([method, method, method])
    expect(calls.map((c) => [c.get('page_size'), c.get('page_no')])).toEqual([
      ['3', '1'],
      ['3', '2'],
      ['3', '3'],
    ])
  })

  it('reports hasMore=false on the last page when total_results is an exact multiple', async () => {
    fakeTop({ [field]: 6 })
    const r = await walk(list, 3, 2)
    expect(r.ids).toEqual(ids(6))
    expect(r.hasMore).toEqual([true, false])
  })

  it('clamps a limit above 100 to page_size=100 and reports the size sent', async () => {
    const calls = fakeTop({ [field]: 250 })
    const adapter = new TmallAdapter()
    const all: string[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 150 })
      all.push(...(await list(adapter, params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(100)
    }
    expect(all).toEqual(ids(250))
    expect(calls.every((c) => c.get('page_size') === '100')).toBe(true)
  })

  it('declares maxPageSize 100 so the router asks for at most 100', async () => {
    fakeTop({ [field]: 7 })
    const adapter = new TmallAdapter()
    expect(adapter.capabilities.maxPageSize).toBe(100)
    const p = parseListQuery({ limit: '3', page: '3' })
    const env = listPage(await list(adapter, p), p, 'tmall')
    expect(env.data.map((r) => r.id)).toEqual(ids(7).slice(6))
    expect(env.meta.hasMore).toBe(false)
  })
})

describe('Tmall listProducts rows', () => {
  it('parse as canonical products and request only documented fields', async () => {
    const calls = fakeTop({ items: 2 })
    const rows = await new TmallAdapter().listProducts(CREDS, withPageSink({ page: 1, limit: 5 }))
    for (const r of rows) ProductSchema.parse(r)
    expect(calls[0]!.get('fields')).toBe('num_iid,title,approve_status,pic_url,list_time,modified')
  })

  // The documented rspSampleJson item of docId 18, cut to the requested fields.
  const SAMPLE_ITEM = {
    approve_status: 'onsale',
    num_iid: 1489161932,
    title: 'Google test item',
    pic_url: 'http://img03.taobao.net/bao/uploaded/i3/T1HXdXXgPSt0JxZ2.8_070458.jpg',
    list_time: '2009-10-22 14:22:06',
    modified: '2000-01-01 00:00:00',
  }

  it('maps the documented sample item through listProducts (images, publishedAt, updatedAt)', async () => {
    fakeTop({ itemRows: [SAMPLE_ITEM] })
    const [p] = await new TmallAdapter().listProducts(CREDS, withPageSink({ page: 1, limit: 5 }))
    const parsed = ProductSchema.parse(p)
    expect(parsed.id).toBe('1489161932')
    expect(parsed.title).toBe('Google test item')
    expect(parsed.images).toEqual([{ url: SAMPLE_ITEM.pic_url, position: 0 }])
    expect(parsed.publishedAt).toBe('2009-10-22T14:22:06.000Z')
    expect(parsed.updatedAt).toBe('2000-01-01T00:00:00.000Z')
  })

  it('throws on a listed row without a title rather than inventing one', async () => {
    const { title: _t, ...untitled } = SAMPLE_ITEM
    fakeTop({ itemRows: [untitled] })
    await expect(
      new TmallAdapter().listProducts(CREDS, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/has no title/)
  })

  it('asks for oldest-listed first (order_by=list_time:asc) so new listings append at the end', async () => {
    const calls = fakeTop({ items: 2 })
    await new TmallAdapter().listProducts(CREDS, withPageSink({ page: 1, limit: 5 }))
    expect(calls[0]!.get('order_by')).toBe('list_time:asc')
  })
})

describe('Tmall listFulfillments / getFulfillment', () => {
  it('list rows parse as canonical fulfillments', async () => {
    fakeTop({ shippings: 2 })
    const rows = await new TmallAdapter().listFulfillments(
      CREDS,
      withPageSink({ page: 1, limit: 5 }),
    )
    for (const r of rows) FulfillmentSchema.parse(r)
    expect(rows.map((r) => r.orderId)).toEqual(['1001', '1002'])
  })

  it('reads a listed id back through taobao.logistics.orders.get by tid', async () => {
    const calls = fakeTop({ splitTid: { '1002': ['LP9', 'LP2'] } })
    const f = await new TmallAdapter().getFulfillment(CREDS, '1002:LP2')
    expect(FulfillmentSchema.parse(f).id).toBe('1002:LP2')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.get('method')).toBe('taobao.logistics.orders.get')
    expect(calls[0]!.get('tid')).toBe('1002')
    expect(calls[0]!.get('page_no')).toBeNull()
  })

  it('404s when the trade has no logistics order with that code', async () => {
    fakeTop({ splitTid: { '1002': ['LP9'] } })
    await expect(new TmallAdapter().getFulfillment(CREDS, '1002:LP2')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('400s on an id that is not tid:order_code, without a request', async () => {
    const calls = fakeTop({})
    await expect(new TmallAdapter().getFulfillment(CREDS, '1002')).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(calls).toHaveLength(0)
  })
})

describe('Tmall inventory levels refuse', () => {
  it('listInventoryLevels throws 501 NOT_SUPPORTED and sends no request', async () => {
    const calls = fakeTop({})
    await expect(
      new TmallAdapter().listInventoryLevels(CREDS, withPageSink({ page: 1, limit: 3 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
  })

  it('getInventoryLevel throws 501 NOT_SUPPORTED and sends no request', async () => {
    const calls = fakeTop({})
    await expect(new TmallAdapter().getInventoryLevel(CREDS, '1:2')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toHaveLength(0)
  })
})
