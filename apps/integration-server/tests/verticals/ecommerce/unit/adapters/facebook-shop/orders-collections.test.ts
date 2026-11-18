/**
 * Facebook Shop listOrders and listCollections, against fakes that honour
 * only what Meta documents.
 *
 * Orders — Order API (https://developers.facebook.com/docs/commerce-platform/order-management/order-api):
 *   "List all the commerce orders associated with a Shop. By default this
 *   endpoint returns orders in `CREATED` state unless state parameter is
 *   specified." The edge is `/<CMS_ID>/commerce_orders`; `state` is a
 *   "Comma-separated list of order states to filter on. When you specify two
 *   or more states behavior is OR. Defaults to `CREATED` if not specified."
 *   The adapter used to call `/<id>/orders`, which is not an edge.
 *
 * Collections — product_sets edge
 * (https://developers.facebook.com/docs/marketing-api/reference/product-catalog/product_sets/):
 *   "Product sets that are in the Catalog". ProductSet's readable fields are
 *   those of Meta's Business SDK (productset.py `_field_types`); asking for a
 *   field outside them fails the read ("requesting a non-existent field" —
 *   https://developers.facebook.com/docs/graph-api/using-graph-api/). The
 *   adapter used to ask for `description` and `filter_spec`, neither of which
 *   exists, so every call failed.
 *
 * Both edges page with Graph API cursors: `limit`, `after`, and `paging.next`
 * present only while more pages remain
 * (https://developers.facebook.com/docs/graph-api/results).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { FacebookShopAdapter } from '../../../../../../src/verticals/ecommerce/adapters/facebook-shop/index'
import { OrderSchema } from '../../../../../../src/verticals/ecommerce/schema/order'
import { CollectionSchema } from '../../../../../../src/verticals/ecommerce/schema/collection'
import {
  buildAuthUrl,
  exchangeCode,
  refreshCredentials,
} from '../../../../../../src/verticals/ecommerce/adapters/facebook-shop/auth'

const CREDS = {
  accessToken: 'tok',
  extra: { catalogId: 'cat1', commerceAccountId: 'cms1' },
}

const ORDER_STATES = ['FB_PROCESSING', 'CREATED', 'IN_PROGRESS', 'COMPLETED']

/** ProductSet fields per Meta's Business SDK productset.py `_field_types`. */
const PRODUCT_SET_FIELDS = new Set([
  'auto_creation_url',
  'filter',
  'id',
  'latest_metadata',
  'live_metadata',
  'name',
  'ordering_info',
  'product_catalog',
  'product_count',
  'retailer_id',
  'metadata',
  'publish_to_shops',
])

/** `order` object fields per the Order API reference. */
const ORDER_FIELD_NAMES = new Set([
  'id',
  'order_status',
  'created',
  'last_updated',
  'items',
  'ship_by_date',
  'merchant_order_id',
  'channel',
  'selected_shipping_option',
  'shipping_address',
  'estimated_payment_details',
  'buyer_details',
])

/** `item` object fields per the Order API reference. */
const ITEM_FIELD_NAMES = new Set([
  'id',
  'retailer_id',
  'product_name',
  'product_id',
  'quantity',
  'selected_shipping_option',
  'status',
  'price_per_unit',
  'tax_details',
  'customization',
])

/** `item` fields marked Default: Yes in the Order API reference. */
const ITEM_DEFAULT_FIELDS = ['id', 'retailer_id', 'product_id', 'quantity', 'price_per_unit']

interface Call {
  path: string
  params: Record<string, unknown>
}

const encode = (i: number): string => Buffer.from(`pos:${i}`).toString('base64')
const decode = (c: string): number => Number(Buffer.from(c, 'base64').toString().slice(4))

function graphError(message: string): Error {
  return Object.assign(new Error(message), {
    response: { status: 400, data: { error: { code: 100, message } } },
  })
}

/** Split a Graph `fields` value into top-level names, and the nested items list. */
function parseFields(fields: string): { top: string[]; nested: Record<string, string[]> } {
  const top: string[] = []
  const nested: Record<string, string[]> = {}
  const re = /([a-z_]+)(\{([^}]*)\})?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fields)) !== null) {
    top.push(m[1]!)
    if (m[3] !== undefined) nested[m[1]!] = m[3].split(',')
  }
  return { top, nested }
}

function page<T>(rows: T[], params: Record<string, unknown>, path: string, defaultSize = 25) {
  const size = params['limit'] === undefined ? defaultSize : Number(params['limit'])
  const start = params['after'] === undefined ? 0 : decode(String(params['after']))
  const end = Math.min(start + size, rows.length)
  const paging: Record<string, unknown> = { cursors: { before: encode(start), after: encode(end) } }
  if (end < rows.length)
    paging['next'] = `https://graph.facebook.com/v25.0${path}?limit=${size}&after=${encode(end)}`
  return { data: rows.slice(start, end), paging }
}

/** Order rows built from the Order API's documented sample responses. */
function makeOrder(i: number, state: string, itemCount = 1) {
  return {
    id: String(335211597203390 + i),
    order_status: { state },
    created: '2019-01-14T19:17:31+00:00',
    last_updated: '2019-01-14T19:47:35+00:00',
    items: {
      data: Array.from({ length: itemCount }, (_, j) => ({
        id: `${372892953378957 + i}${j === 0 ? '' : `-${j}`}`,
        product_id: '2416339625125194',
        retailer_id: 'FB_product_1237',
        product_name: `Product ${i}${j === 0 ? '' : `.${j}`}`,
        quantity: 1,
        price_per_unit: { amount: '0.99', currency: 'USD' },
      })),
    },
    estimated_payment_details: {
      subtotal: {
        items: { amount: '2.00', currency: 'USD' },
        shipping: { amount: '0.00', currency: 'USD' },
      },
      tax: { amount: '0.19', currency: 'USD' },
      total_amount: { amount: '2.19', currency: 'USD' },
      tax_remitted: true,
    },
  }
}

function fakeGraph(
  opts: {
    orders?: number
    sets?: number
    /** Line items on each order. */
    itemsPerOrder?: number
    /** Size of the nested `items` page on an order (undocumented upstream). */
    nestedItems?: number
    /** Default page size of GET /{ORDER_ID}/items. */
    itemsPage?: number
  } = {},
): Call[] {
  const calls: Call[] = []
  const orders = Array.from({ length: opts.orders ?? 0 }, (_, i) =>
    makeOrder(i + 1, ORDER_STATES[i % ORDER_STATES.length]!, opts.itemsPerOrder ?? 1),
  )
  const nestedSize = opts.nestedItems ?? 25
  const pick = (it: Record<string, unknown>, fields: Set<string>) =>
    Object.fromEntries(Object.entries(it).filter(([k]) => fields.has(k)))
  /** An order as Graph returns it: requested fields only, items a paged edge. */
  const shape = (o: ReturnType<typeof makeOrder>, fieldsParam: unknown) => {
    const { top, nested } = parseFields(String(fieldsParam ?? ''))
    for (const f of top) if (!ORDER_FIELD_NAMES.has(f)) throw graphError(`nonexisting field ${f}`)
    for (const f of nested['items'] ?? [])
      if (!ITEM_FIELD_NAMES.has(f)) throw graphError(`nonexisting field items.${f}`)
    // Items return only the requested fields, else the documented defaults.
    const itemFields = new Set(nested['items'] ?? ITEM_DEFAULT_FIELDS)
    const all = o.items.data.map((it) => pick(it, itemFields))
    const itemsPage = page(all, {}, `/${o.id}/items`, nestedSize)
    return { ...o, items: itemsPage }
  }
  const sets = Array.from({ length: opts.sets ?? 0 }, (_, i) => ({
    id: String(1000 + i + 1),
    name: `Set ${i + 1}`,
    filter: '{"product_type":{"i_contains":"shirt"}}',
    product_count: i,
    retailer_id: `set-${i + 1}`,
  }))

  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = { ...(cfg?.params ?? {}) }
    calls.push({ path, params })
    const known = new Set(['access_token', 'fields', 'limit', 'after'])
    if (path === '/cms1/commerce_orders') {
      for (const k of Object.keys(params))
        if (!known.has(k) && k !== 'state') throw graphError(`unexpected param ${k}`)
      const states =
        params['state'] === undefined ? ['CREATED'] : String(params['state']).split(',')
      for (const s of states) if (!ORDER_STATES.includes(s)) throw graphError(`bad state ${s}`)
      const rows = orders
        .filter((o) => states.includes(o.order_status.state))
        .map((o) => shape(o, params['fields']))
      return { data: page(rows, params, path) }
    }
    const itemsEdge = /^\/(\d+)\/items$/.exec(path)
    const order = orders.find((o) => path === `/${o.id}` || itemsEdge?.[1] === o.id)
    if (order && itemsEdge) {
      // List Order Items: default fields unless others are asked for.
      for (const k of Object.keys(params)) if (!known.has(k)) throw graphError(`unexpected ${k}`)
      const fields =
        params['fields'] === undefined ? ITEM_DEFAULT_FIELDS : String(params['fields']).split(',')
      for (const f of fields)
        if (!ITEM_FIELD_NAMES.has(f)) throw graphError(`nonexisting field ${f}`)
      const rows = order.items.data.map((it) => pick(it, new Set(fields)))
      return { data: page(rows, params, path, opts.itemsPage ?? 2) }
    }
    if (order) {
      for (const k of Object.keys(params)) if (!known.has(k)) throw graphError(`unexpected ${k}`)
      return { data: shape(order, params['fields']) }
    }
    if (path === '/cat1/product_sets') {
      for (const k of Object.keys(params)) if (!known.has(k)) throw graphError(`unexpected ${k}`)
      for (const f of String(params['fields'] ?? '').split(','))
        if (!PRODUCT_SET_FIELDS.has(f)) throw graphError(`Tried accessing nonexisting field (${f})`)
      return { data: page(sets, params, path) }
    }
    if (path === '/1001') {
      for (const f of String(params['fields'] ?? '').split(','))
        if (!PRODUCT_SET_FIELDS.has(f)) throw graphError(`Tried accessing nonexisting field (${f})`)
      return { data: sets[0] }
    }
    throw graphError(`unexpected GET ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return calls
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

type Lister = (
  a: FacebookShopAdapter,
  p: ReturnType<typeof withPageSink>,
) => Promise<{ id: string }[]>

async function walk(list: Lister, limit: number, pages: number) {
  const adapter = new FacebookShopAdapter()
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    ids.push(...(await list(adapter, params)).map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore }
}

describe('Facebook Shop listOrders reads /{CMS_ID}/commerce_orders', () => {
  const listOrders: Lister = (a, p) => a.listOrders(CREDS, p)

  it('calls the commerce_orders edge with every documented state', async () => {
    const calls = fakeGraph({ orders: 3 })
    await new FacebookShopAdapter().listOrders(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/cms1/commerce_orders')
    expect(String(calls[0]!.params['state']).split(',').sort()).toEqual([...ORDER_STATES].sort())
    expect(calls[0]!.params['limit']).toBe(10)
  })

  it('targets a Graph API version that has not expired (v19.0 expired May 21, 2026)', async () => {
    fakeGraph({ orders: 1 })
    await new FacebookShopAdapter().listOrders(CREDS, withPageSink({ page: 1, limit: 10 }))
    const cfg = vi.mocked(axios.create).mock.calls[0]![0] as { baseURL?: string }
    expect(cfg.baseURL).toBe('https://graph.facebook.com/v25.0')
  })

  it('returns orders in every state, not only CREATED', async () => {
    fakeGraph({ orders: 4 })
    const rows = await new FacebookShopAdapter().listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(rows.map((r) => r.fulfillmentStatus)).toEqual([
      'UNFULFILLED',
      'UNFULFILLED',
      'unknown',
      'FULFILLED',
    ])
  })

  it('serves 2L+1 orders over three pages, each once, hasMore exact', async () => {
    const calls = fakeGraph({ orders: 7 })
    const r = await walk(listOrders, 3, 3)
    expect(r.ids).toEqual(Array.from({ length: 7 }, (_, i) => String(335211597203390 + i + 1)))
    expect(r.hasMore).toEqual([true, true, false])
    expect(calls).toHaveLength(3)
    expect(calls[1]!.params['after']).toBe(encode(3))
  })

  it('every listed order parses as a canonical Order', async () => {
    fakeGraph({ orders: 4 })
    const rows = await new FacebookShopAdapter().listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 10 }),
    )
    for (const r of rows) OrderSchema.parse(r)
    expect(rows[0]!.lineItems![0]!.title).toBe('Product 1')
  })

  it('does not forward updatedAfter (updated_after filters on status change only)', async () => {
    const calls = fakeGraph({ orders: 4 })
    const rows = await new FacebookShopAdapter().listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2019-01-14T19:30:00Z') }),
    )
    expect(rows).toHaveLength(4)
    expect(Object.keys(calls[0]!.params).sort()).toEqual([
      'access_token',
      'fields',
      'limit',
      'state',
    ])
  })

  it('reads every line item when an order has more than its nested items page', async () => {
    const calls = fakeGraph({ orders: 2, itemsPerOrder: 5, nestedItems: 2, itemsPage: 2 })
    const rows = await new FacebookShopAdapter().listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 10 }),
    )
    for (const r of rows) OrderSchema.parse(r)
    expect(rows[0]!.lineItems!.map((li) => li.title)).toEqual([
      'Product 1',
      'Product 1.1',
      'Product 1.2',
      'Product 1.3',
      'Product 1.4',
    ])
    expect(rows[1]!.lineItems).toHaveLength(5)
    const itemCalls = calls.filter((c) => c.path === '/335211597203391/items')
    // 5 items at the edge's 2 per page: 3 pages, walked by after cursor.
    expect(itemCalls.map((c) => c.params['after'])).toEqual([undefined, encode(2), encode(4)])
    for (const c of itemCalls) expect(String(c.params['fields'])).toContain('product_name')
  })

  it('makes no extra request when the nested items page is the last', async () => {
    const calls = fakeGraph({ orders: 2, itemsPerOrder: 2, nestedItems: 2 })
    const rows = await new FacebookShopAdapter().listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(rows[0]!.lineItems).toHaveLength(2)
    expect(calls).toHaveLength(1)
  })

  it('refuses without a commerceAccountId and sends nothing', async () => {
    const calls = fakeGraph({ orders: 1 })
    await expect(
      new FacebookShopAdapter().listOrders(
        { accessToken: 'tok', extra: { catalogId: 'cat1' } },
        withPageSink({ page: 1, limit: 3 }),
      ),
    ).rejects.toThrow(/commerceAccountId/)
    expect(calls).toHaveLength(0)
  })
})

describe('Facebook Shop getOrder reads /{ORDER_ID}', () => {
  it('expands items with product_name and maps the order', async () => {
    const calls = fakeGraph({ orders: 1 })
    const o = await new FacebookShopAdapter().getOrder(CREDS, '335211597203391')
    OrderSchema.parse(o)
    expect(o.id).toBe('335211597203391')
    expect(o.lineItems!.map((li) => li.title)).toEqual(['Product 1'])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/335211597203391')
    expect(parseFields(String(calls[0]!.params['fields'])).nested['items']).toContain(
      'product_name',
    )
  })

  it('reads the rest of a truncated items edge from /{ORDER_ID}/items', async () => {
    fakeGraph({ orders: 1, itemsPerOrder: 3, nestedItems: 1, itemsPage: 2 })
    const o = await new FacebookShopAdapter().getOrder(CREDS, '335211597203391')
    expect(o.lineItems!.map((li) => li.id)).toEqual([
      '372892953378958',
      '372892953378958-1',
      '372892953378958-2',
    ])
  })
})

describe('Facebook Shop OAuth targets an unexpired Graph API version', () => {
  it('builds the dialog URL on v25.0', () => {
    expect(buildAuthUrl('app', 'https://cb', 'st')).toMatch(
      /^https:\/\/www\.facebook\.com\/v25\.0\/dialog\/oauth\?/,
    )
  })

  it('exchanges and refreshes tokens at the v25.0 token URL', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { access_token: 't', token_type: 'bearer', expires_in: 5184000 } })
    await exchangeCode('code', 'https://cb', 'app', 'secret')
    await refreshCredentials({ accessToken: 't0', extra: { appId: 'app', appSecret: 'secret' } })
    const urls = get.mock.calls.map((c) => c[0])
    expect(urls).toHaveLength(3)
    for (const u of urls) expect(u).toBe('https://graph.facebook.com/v25.0/oauth/access_token')
  })
})

describe('Facebook Shop listCollections reads /{catalog_id}/product_sets', () => {
  const listCollections: Lister = (a, p) => a.listCollections(CREDS, p)

  it('asks only for fields ProductSet has', async () => {
    const calls = fakeGraph({ sets: 2 })
    const rows = await new FacebookShopAdapter().listCollections(
      CREDS,
      withPageSink({ page: 1, limit: 5 }),
    )
    expect(rows.map((r) => r.id)).toEqual(['1001', '1002'])
    expect(calls[0]!.params['fields']).not.toMatch(/description|filter_spec/)
    for (const r of rows) CollectionSchema.parse(r)
  })

  it('serves 2L+1 sets over three pages, each once, hasMore exact', async () => {
    const calls = fakeGraph({ sets: 7 })
    const r = await walk(listCollections, 3, 3)
    expect(r.ids).toEqual(Array.from({ length: 7 }, (_, i) => String(1000 + i + 1)))
    expect(r.hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params['after'])).toEqual([undefined, encode(3), encode(6)])
  })

  it('a cold page 2 walks the cursor chain rather than repeating page 1', async () => {
    fakeGraph({ sets: 7 })
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await new FacebookShopAdapter().listCollections(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['1004', '1005', '1006'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('getCollection reads the same documented fields back', async () => {
    fakeGraph({ sets: 1 })
    const c = await new FacebookShopAdapter().getCollection(CREDS, '1001')
    expect(c).toMatchObject({ id: '1001', title: 'Set 1' })
  })
})
