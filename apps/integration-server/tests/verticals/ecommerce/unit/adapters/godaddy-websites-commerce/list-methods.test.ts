/**
 * GoDaddy Commerce read methods: request shape, paging walks and refusals.
 *
 * The fake GoDaddy honours only documented parameters:
 *  - catalog subgraph `POST /v2/commerce/stores/{storeId}/catalog-subgraph`
 *    with the required `x-store-id` header, `first` / `after` and
 *    `updatedAt: { gt }`, answering `edges { node }`, `pageInfo { hasNextPage
 *    endCursor }` and `totalCount`
 *    (https://developer.godaddy.com/docs/api-users/commerce/manage-catalog);
 *  - order subgraph `POST /v1/commerce/order-subgraph` with `x-store-id`,
 *    `orders(first, after)` and `filterOrders(first, after, updatedAtStart)`
 *    (https://developer.godaddy.com/docs/references/rest/orders/order/queries/filterOrders);
 *  - `GET /v1/commerce/stores/{storeId}/customers` with `page`, `pageSize`
 *    (max 500), `totalRequired`, `updatedAtStart`
 *    (https://developer.godaddy.com/openapi/customers.json).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'

const { post, get, create } = vi.hoisted(() => {
  const post = vi.fn()
  const get = vi.fn()
  const create = vi.fn((_config?: unknown) => ({ post, get, put: vi.fn(), delete: vi.fn() }))
  return { post, get, create }
})
vi.mock('axios', () => ({ default: { create } }))

import { GodaddyWebsitesCommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/index'

const STORE = '0b3f6c1e-5a4d-4e2b-9c8f-7a6b5c4d3e2f'
const CREDENTIALS: Credentials = { accessToken: 'pat_live_abc', extra: { storeId: STORE } }
const CATALOG_PATH = `/v2/commerce/stores/${STORE}/catalog-subgraph`
const ORDER_PATH = '/v1/commerce/order-subgraph'

function adapter(storeId?: string): GodaddyWebsitesCommerceAdapter {
  return new GodaddyWebsitesCommerceAdapter({
    clientId: 'unused',
    clientSecret: 'unused',
    redirectUri: 'https://example.test/cb',
    shop: 'unused',
    ...(storeId ? { storeId } : {}),
  })
}

const TS = '2026-08-27T10:00:00.000Z'
const NODE_FACTORIES: Record<string, (i: number) => Record<string, unknown>> = {
  skuGroups: (i) => ({
    id: `sg-${i}`,
    name: `group-${i}`,
    label: null,
    status: 'ACTIVE',
    type: 'PHYSICAL',
    createdAt: TS,
    updatedAt: TS,
  }),
  skus: (i) => ({
    id: `sku-${i}`,
    code: `CODE-${i}`,
    name: `sku-${i}`,
    createdAt: TS,
    updatedAt: TS,
    skuGroup: { id: 'sg-1' },
    prices: { edges: [{ node: { value: { value: 1000 + i, currencyCode: 'USD' } } }] },
  }),
  lists: (i) => ({ id: `list-${i}`, name: `list-${i}`, createdAt: TS, updatedAt: TS }),
  locations: (i) => ({
    id: `loc-${i}`,
    name: `loc-${i}`,
    status: 'ACTIVE',
    createdAt: TS,
    updatedAt: TS,
  }),
  orders: (i) => ({
    id: `Order_${i}`,
    number: String(i),
    totals: { total: { value: 100 * i, currencyCode: 'USD' } },
    lineItems: [
      {
        id: `LineItem_${i}`,
        name: 'Coffee mug',
        quantity: 1,
        skuId: 'SKU_ID',
        unitAmount: { value: 100 * i, currencyCode: 'USD' },
      },
    ],
  }),
}
NODE_FACTORIES.filterOrders = NODE_FACTORIES.orders!

/**
 * GraphQL answers only what the query selects: a node's top-level field (and
 * the connection's `totalCount`) is returned only when the query names it,
 * so a selection set that drops `prices`, `lineItems` or `totalCount` fails.
 */
function selected(query: string, key: string): boolean {
  return new RegExp(`\\b${key}\\b`).test(query)
}
function project(node: Record<string, unknown>, query: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(node).filter(([k]) => selected(query, k)))
}

/** A cursor connection over `total` rows, honouring only `first` and `after`. */
function connection(
  field: string,
  total: number,
  variables: Record<string, unknown>,
  query: string,
) {
  const first = variables.first as number
  const start = variables.after === undefined ? 0 : Number(variables.after)
  const rows = Array.from({ length: total }, (_, i) =>
    project(NODE_FACTORIES[field]!(i + 1), query),
  )
  const slice = rows.slice(start, start + first)
  const end = start + slice.length
  return {
    edges: slice.map((node) => ({ node })),
    pageInfo: { hasNextPage: end < total, endCursor: slice.length ? String(end) : null },
    ...(field === 'orders' || field === 'filterOrders' || !selected(query, 'totalCount')
      ? {}
      : { totalCount: total }),
  }
}

/** Fake subgraphs: the store header is required, as documented. */
function fakeGraphql(total: number) {
  post.mockImplementation(
    async (
      url: string,
      body: { query: string; variables: Record<string, unknown> },
      config: { headers: Record<string, string> },
    ) => {
      if (config?.headers?.['x-store-id'] !== STORE) {
        return {
          data: {
            data: null,
            errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }],
          },
        }
      }
      if (url !== CATALOG_PATH && url !== ORDER_PATH) throw new Error(`unexpected POST ${url}`)
      const field = /\{ (\w+)\(first: \$first/.exec(body.query)?.[1]
      if (!field) throw new Error(`unexpected query ${body.query}`)
      return { data: { data: { [field]: connection(field, total, body.variables, body.query) } } }
    },
  )
}

function walkParams(page: number, limit: number, extra: Partial<QueryParams> = {}): QueryParams {
  return withPageSink({ page, limit, ...extra } as QueryParams)
}

type ListMethod =
  'listProducts' | 'listVariants' | 'listCollections' | 'listLocations' | 'listOrders'

const CATALOG_CASES: Array<[ListMethod, string]> = [
  ['listProducts', 'skuGroups'],
  ['listVariants', 'skus'],
  ['listCollections', 'lists'],
  ['listLocations', 'locations'],
]

beforeEach(() => {
  post.mockReset()
  get.mockReset()
  create.mockClear()
  _resetCursorPager()
})

describe('GoDaddy client host and auth', () => {
  it('sends a Bearer PAT to https://api.godaddy.com', async () => {
    fakeGraphql(1)
    await adapter().listProducts(CREDENTIALS, walkParams(1, 2))
    const cfg = create.mock.calls.at(-1)![0] as unknown as {
      baseURL: string
      headers: Record<string, string>
    }
    expect(cfg.baseURL).toBe('https://api.godaddy.com')
    expect(cfg.headers.Authorization).toBe('Bearer pat_live_abc')
    expect(cfg.headers['X-Shopify-Access-Token']).toBeUndefined()
  })

  it('takes the store from config when credentials carry none', async () => {
    fakeGraphql(1)
    const rows = await adapter(STORE).listProducts(
      { accessToken: 'pat_live_abc' },
      walkParams(1, 2),
    )
    expect(rows.map((r) => r.id)).toEqual(['sg-1'])
  })

  it('refuses with 501 naming storeId, before any request, when no store is known', async () => {
    await expect(
      adapter().listProducts({ accessToken: 'pat' }, walkParams(1, 2)),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('storeId'),
    })
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  it('surfaces a GraphQL errors array (HTTP 200) as an error', async () => {
    post.mockResolvedValue({
      data: {
        data: null,
        errors: [{ message: 'boom', extensions: { code: 'INTERNAL_SERVER_ERROR' } }],
      },
    })
    await expect(adapter().listProducts(CREDENTIALS, walkParams(1, 2))).rejects.toThrow(
      /INTERNAL_SERVER_ERROR: boom/,
    )
  })
})

describe.each(CATALOG_CASES)('%s pages the catalog %s connection', (method, field) => {
  it('sends the catalog path, x-store-id, first = limit, and no after on page 1', async () => {
    fakeGraphql(5)
    await adapter()[method](CREDENTIALS, walkParams(1, 2))
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe(CATALOG_PATH)
    expect(config.headers['x-store-id']).toBe(STORE)
    expect(body.query).toContain(`${field}(first: $first, after: $after, updatedAt: $updatedAt)`)
    expect(body.variables.first).toBe(2)
    expect(body.variables.after).toBeUndefined()
    expect(body.variables.updatedAt).toBeUndefined()
  })

  it('walks N = 2L+1 rows: every id once, hasMore exact, totalCount reported', async () => {
    fakeGraphql(5)
    const a = adapter()
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = walkParams(page, 2)
      const rows = await a[method](CREDENTIALS, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(5)
    }
    expect(seen).toHaveLength(5)
    expect(new Set(seen).size).toBe(5)
    expect(hasMore).toEqual([true, true, false])
    // page 2 continued from page 1's endCursor, page 3 from page 2's
    expect(post.mock.calls.map((c) => c[1].variables.after)).toEqual([undefined, '2', '4'])

    const past = walkParams(4, 2)
    expect(await a[method](CREDENTIALS, past)).toEqual([])
    expect(readUpstreamPage(past)?.hasMore).toBe(false)
  })

  it('maps updatedAfter onto the documented updatedAt: { gt } filter', async () => {
    fakeGraphql(1)
    const updatedAfter = new Date('2026-09-01T00:00:00Z')
    await adapter()[method](CREDENTIALS, walkParams(1, 2, { updatedAfter }))
    expect(post.mock.calls[0]![1].variables.updatedAt).toEqual({ gt: '2026-09-01T00:00:00.000Z' })
  })
})

describe('listOrders pages the order subgraph', () => {
  it('sends orders(first, after) to the order subgraph with x-store-id', async () => {
    fakeGraphql(5)
    await adapter().listOrders(CREDENTIALS, walkParams(1, 2))
    const [url, body, config] = post.mock.calls[0]!
    expect(url).toBe(ORDER_PATH)
    expect(config.headers['x-store-id']).toBe(STORE)
    expect(body.query).toContain('orders(first: $first, after: $after)')
    expect(body.variables).toEqual({ first: 2, after: undefined })
  })

  it('walks N = 2L+1 orders: every id once, hasMore exact', async () => {
    fakeGraphql(5)
    const a = adapter()
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = walkParams(page, 2)
      const orders = await a.listOrders(CREDENTIALS, params)
      seen.push(...orders.map((o) => o.id))
      for (const o of orders)
        expect(o.lineItems?.map((li) => li.id)).toEqual([`LineItem_${o.orderNumber}`])
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(new Set(seen).size).toBe(5)
    expect(seen).toHaveLength(5)
    expect(hasMore).toEqual([true, true, false])
  })

  it('with updatedAfter, walks filterOrders(updatedAtStart) instead', async () => {
    fakeGraphql(3)
    const updatedAfter = new Date('2026-09-01T00:00:00Z')
    const a = adapter()
    const seen: string[] = []
    for (const page of [1, 2]) {
      seen.push(
        ...(await a.listOrders(CREDENTIALS, walkParams(page, 2, { updatedAfter }))).map(
          (o) => o.id,
        ),
      )
    }
    expect(seen).toEqual(['Order_1', 'Order_2', 'Order_3'])
    const [, body] = post.mock.calls[0]!
    expect(body.query).toContain(
      'filterOrders(first: $first, after: $after, updatedAtStart: $updatedAtStart)',
    )
    expect(body.variables.updatedAtStart).toBe('2026-09-01T00:00:00.000Z')
  })
})

describe('listCustomers pages the REST customers endpoint', () => {
  /**
   * The last customer is a guest ("those without an associated user record"),
   * which the endpoint drops unless `excludeGuestCustomers` is false
   * (documented default: true).
   */
  function fakeCustomers(total: number) {
    get.mockImplementation(async (url: string, config: { params: Record<string, unknown> }) => {
      if (url !== `/v1/commerce/stores/${STORE}/customers`) throw new Error(`unexpected GET ${url}`)
      const page = (config.params.page as number) ?? 1
      const pageSize = Math.min((config.params.pageSize as number) ?? 25, 500)
      const rows = Array.from({ length: total }, (_, i) => ({
        customerId: `cust-${i + 1}`,
        firstName: 'A',
        lastName: 'B',
        createdAt: TS,
        updatedAt: TS,
      })).filter((_, i) => config.params.excludeGuestCustomers === false || i < total - 1)
      const count = rows.length
      const slice = rows.slice((page - 1) * pageSize, page * pageSize)
      return {
        data: {
          customers: slice,
          links: [
            {
              rel: 'self',
              href: `https://api.godaddy.com/v1/commerce/stores/${STORE}/customers?page=${page}`,
            },
          ],
          ...(config.params.totalRequired
            ? { totalItems: count, totalPages: Math.ceil(count / pageSize) }
            : {}),
        },
      }
    })
  }

  it('sends page, pageSize = limit, totalRequired, and includes guest customers', async () => {
    fakeCustomers(5)
    await adapter().listCustomers(CREDENTIALS, walkParams(2, 2))
    const [url, config] = get.mock.calls[0]!
    expect(url).toBe(`/v1/commerce/stores/${STORE}/customers`)
    expect(config.params).toEqual({
      page: 2,
      pageSize: 2,
      totalRequired: true,
      excludeGuestCustomers: false,
    })
  })

  it('walks N = 2L+1 customers: every id once, hasMore from totalPages', async () => {
    fakeCustomers(5)
    const a = adapter()
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = walkParams(page, 2)
      seen.push(...(await a.listCustomers(CREDENTIALS, params)).map((c) => c.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(5)
    }
    expect(new Set(seen).size).toBe(5)
    expect(seen).toHaveLength(5)
    expect(hasMore).toEqual([true, true, false])
  })

  it('clamps pageSize to the documented 500 and reports the size it sent', async () => {
    fakeCustomers(1)
    const params = walkParams(1, 600)
    await adapter().listCustomers(CREDENTIALS, params)
    expect(get.mock.calls[0]![1].params.pageSize).toBe(500)
    expect(readUpstreamPage(params)?.pageSize).toBe(500)
  })

  it('maps updatedAfter onto updatedAtStart', async () => {
    fakeCustomers(1)
    await adapter().listCustomers(
      CREDENTIALS,
      walkParams(1, 2, { updatedAfter: new Date('2026-09-01T00:00:00Z') }),
    )
    expect(get.mock.calls[0]![1].params.updatedAtStart).toBe('2026-09-01T00:00:00.000Z')
  })

  it('refuses a page past the documented 10,000-record page ceiling without a request', async () => {
    await expect(adapter().listCustomers(CREDENTIALS, walkParams(21, 500))).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
    fakeCustomers(1)
    await adapter().listCustomers(CREDENTIALS, walkParams(20, 500))
    expect(get).toHaveBeenCalledTimes(1)
  })
})

describe('selection sets carry the fields the transforms read', () => {
  it('listVariants selects SKU prices and maps the one price', async () => {
    fakeGraphql(1)
    const [v] = await adapter().listVariants(CREDENTIALS, walkParams(1, 2))
    expect(v!.price).toEqual({ amount: 1001, currency: 'USD' })
  })
})

describe('pager keys separate incremental walks from full walks', () => {
  it.each([...CATALOG_CASES.map(([m]) => m), 'listOrders' as const])(
    "%s: an updatedAfter walk does not reuse a full walk's cursors",
    async (method) => {
      fakeGraphql(5)
      const a = adapter()
      await a[method](CREDENTIALS, walkParams(1, 2))
      post.mockClear()
      const updatedAfter = new Date('2026-09-01T00:00:00Z')
      await a[method](CREDENTIALS, walkParams(2, 2, { updatedAfter }))
      // no cursor is known for the filtered walk, so it starts from the top
      expect(post.mock.calls[0]![1].variables.after).toBeUndefined()
    },
  )
})

describe('defensive errors', () => {
  it('throws when hasNextPage is true but endCursor is empty', async () => {
    post.mockResolvedValue({
      data: {
        data: {
          skuGroups: {
            edges: [{ node: NODE_FACTORIES.skuGroups!(1) }],
            pageInfo: { hasNextPage: true, endCursor: null },
            totalCount: 2,
          },
        },
      },
    })
    await expect(adapter().listProducts(CREDENTIALS, walkParams(1, 1))).rejects.toThrow(
      /hasNextPage is true but endCursor is empty/,
    )
  })

  it('throws when a GraphQL response carries neither data nor errors', async () => {
    post.mockResolvedValue({ data: { data: null } })
    await expect(adapter().listProducts(CREDENTIALS, walkParams(1, 1))).rejects.toThrow(
      /carried no data/,
    )
  })
})

describe('get methods read the documented single-record queries', () => {
  it('getProduct/getVariant/getCollection/getLocation query skuGroup/sku/list/location by id', async () => {
    post.mockImplementation(
      async (_url: string, body: { query: string; variables: { id: string } }) => {
        const field = /\{ (\w+)\(id: \$id\)/.exec(body.query)![1]!
        const factory = {
          skuGroup: 'skuGroups',
          sku: 'skus',
          list: 'lists',
          location: 'locations',
        }[field]!
        return {
          data: { data: { [field]: { ...NODE_FACTORIES[factory]!(1), id: body.variables.id } } },
        }
      },
    )
    const a = adapter()
    expect((await a.getProduct(CREDENTIALS, 'G1')).id).toBe('G1')
    expect((await a.getVariant(CREDENTIALS, 'S1')).id).toBe('S1')
    expect((await a.getCollection(CREDENTIALS, 'L1')).id).toBe('L1')
    expect((await a.getLocation(CREDENTIALS, 'X1')).id).toBe('X1')
    expect(post.mock.calls.map((c) => c[0])).toEqual([
      CATALOG_PATH,
      CATALOG_PATH,
      CATALOG_PATH,
      CATALOG_PATH,
    ])
  })

  it('a null node is a 404', async () => {
    post.mockResolvedValue({ data: { data: { skuGroup: null } } })
    await expect(adapter().getProduct(CREDENTIALS, 'nope')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('getOrder queries orderById on the order subgraph', async () => {
    post.mockImplementation(async (_url: string, body: { query: string }) => ({
      data: { data: { orderById: project(NODE_FACTORIES.orders!(7), body.query) } },
    }))
    const o = await adapter().getOrder(CREDENTIALS, 'Order_7')
    expect(o.id).toBe('Order_7')
    expect(o.lineItems?.map((li) => li.id)).toEqual(['LineItem_7'])
    const [url, body] = post.mock.calls[0]!
    expect(url).toBe(ORDER_PATH)
    expect(body.query).toContain('orderById(id: $id)')
    expect(body.variables).toEqual({ id: 'Order_7' })
  })

  it('getOrder on an unknown id is a 404', async () => {
    post.mockResolvedValue({ data: { data: { orderById: null } } })
    await expect(adapter().getOrder(CREDENTIALS, 'nope')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('getCustomer reads { customer } from the customer path', async () => {
    get.mockResolvedValue({
      data: {
        customer: {
          customerId: 'c-1',
          firstName: 'A',
          lastName: 'B',
          createdAt: TS,
          updatedAt: TS,
        },
        links: [],
      },
    })
    expect((await adapter().getCustomer(CREDENTIALS, 'c-1')).id).toBe('c-1')
    expect(get.mock.calls[0]![0]).toBe(`/v1/commerce/stores/${STORE}/customers/c-1`)
  })
})

describe('discounts are refused: no documented discount query', () => {
  it('listDiscounts throws 501 NOT_SUPPORTED and sends nothing', async () => {
    await expect(adapter().listDiscounts(CREDENTIALS, walkParams(1, 2))).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  it('getDiscount throws 501 NOT_SUPPORTED and sends nothing', async () => {
    await expect(adapter().getDiscount(CREDENTIALS, 'd1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })
})
