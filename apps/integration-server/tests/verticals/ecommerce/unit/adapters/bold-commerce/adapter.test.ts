/**
 * Bold Commerce adapter: host, auth, request shape, paging and refusals, with
 * HTTP faked at `axios.create`. The fake serves Bold's documented page/limit
 * paging and `pagination` block, and rejects any query parameter the endpoint
 * does not document.
 *
 * Docs: https://developer.boldcommerce.com/guides/checkout/public-integrations,
 * https://developer.boldcommerce.com/guides/checkout/resources/query-pagination,
 * https://developer.boldcommerce.com/api/{products,customers,price-rules,checkout-admin}.openapi.yaml
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { BoldCommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/bold-commerce/index'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../src/verticals/ecommerce/schema/product'
import { CollectionSchema } from '../../../../../../src/verticals/ecommerce/schema/collection'
import { CustomerSchema } from '../../../../../../src/verticals/ecommerce/schema/customer'
import { DiscountSchema } from '../../../../../../src/verticals/ecommerce/schema/discount'
import { LocationSchema } from '../../../../../../src/verticals/ecommerce/schema/location'

const CFG = {
  clientId: 'cid',
  clientSecret: 'csec',
  redirectUri: 'https://app.example.com/complete_install',
}
const SHOP = 'zp3oafdor9'
const CREDS: Credentials = {
  accessToken: 'tok-abc',
  extra: { shopIdentifier: SHOP, currency: 'CAD' },
}

afterEach(() => vi.restoreAllMocks())

type Query = Record<string, unknown>
interface Call {
  path: string
  params?: Query
}

/** Documented query parameters per list path (the fake rejects any other). */
const DOCUMENTED: Record<string, string[]> = {
  [`/products/v2/shops/${SHOP}/products`]: [
    'deep',
    'limit',
    'page',
    'filter',
    'categoryid',
    'filtercolumn',
    'filtervalue',
    'ordercolumn',
    'orderdirection',
    'updated_at_min',
    'updated_at_max',
    'include_deleted',
    'es_optimize',
  ],
  [`/products/v2/shops/${SHOP}/variants`]: ['filter', 'limit', 'page'],
  [`/products/v2/shops/${SHOP}/categories`]: ['limit', 'page', 'ids'],
  [`/customers/v2/shops/${SHOP}/customers`]: [
    'since_id',
    'updated_at_min',
    'updated_at_max',
    'search',
    'ids',
    'orderby',
    'orderdirection',
    'filter',
    'label',
    'limit',
    'page',
  ],
  [`/price_rules/rules/v2/shops/${SHOP}/rulesets`]: [
    'external_ids',
    'fields',
    'page',
    'limit',
    'include_all_apps',
  ],
  [`/checkout/shop/${SHOP}/zones/warehouses`]: [],
  [`/checkout/shop/${SHOP}/zones`]: [],
}

function fakeBold(handler: (path: string, params: Query) => unknown) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Query }) => {
    const params = cfg?.params ?? {}
    const allowed = DOCUMENTED[path]
    if (allowed) {
      const extra = Object.keys(params).filter((k) => !allowed.includes(k))
      if (extra.length) throw new Error(`undocumented params ${extra.join(',')} on ${path}`)
    }
    calls.push({ path, params: cfg?.params })
    return { data: handler(path, params) }
  })
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { calls, create, get }
}

/** Bold's page/limit paging over `rows`, with the documented pagination block. */
function servePage<T>(rows: T[], params: Query) {
  const limit = Number(params.limit)
  const page = Number(params.page)
  if (!(limit >= 1 && limit <= 100)) throw new Error(`limit ${limit} outside 1..100`)
  const slice = rows.slice((page - 1) * limit, page * limit)
  const totalPages = Math.ceil(rows.length / limit)
  return {
    slice,
    pagination: {
      total: rows.length,
      count: slice.length,
      per_page: limit,
      current_page: page,
      total_pages: totalPages,
    },
  }
}

// Fixtures built from the spec's documented examples.
const variant = (id: number) => ({
  id,
  shop_identifier: SHOP,
  platform_id: { string_value: `platform-${id}` },
  name: 'Default Title',
  sku: 'BEACH-HAT-PURPLE',
  weight_unit: 'kg',
  grams: 1000,
  inventory_quantity: 5,
  allow_backorder: true,
  created_at: '2021-11-04T19:09:52Z',
  updated_at: '2021-11-04T19:09:52Z',
  require_shipping: true,
  price: 30,
  cost: 25,
  compare_at_price: 30,
  tax_code: 'non-taxable',
  weight: 1,
  tax_exempt: true,
})
const deepProduct = (id: number) => ({
  product: {
    id,
    shop_identifier: SHOP,
    name: 'Beach hat',
    handle: 'beach-hat',
    description: 'A hat for the beach',
    type: 'Hat',
    vendor: 'OFS',
    tags: 'hat, summer, beach',
    created_at: '2021-11-04T19:09:52Z',
    updated_at: '2021-11-04T19:09:52Z',
    published: true,
  },
  variants: [variant(id * 10)],
})
const category = (id: number) => ({
  id,
  shop_identifier: SHOP,
  name: 'Hats',
  updated_at: '2021-11-04T19:09:52Z',
})
const customer = (id: number) => ({
  id,
  shop_identifier: SHOP,
  first_name: 'John',
  last_name: 'Doe',
  email: 'john.doe@example.com',
  platform_created_at: '2021-11-04T19:09:52Z',
})
const ruleset = (id: number) => ({ id, public_name: `Ruleset ${id}`, active: true, rules: [] })

async function list(adapter: BoldCommerceAdapter, method: string, params: QueryParams) {
  const fn = (
    adapter as unknown as Record<
      string,
      (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>
    >
  )[method]!
  return fn.call(adapter, CREDS, params)
}

describe('BoldCommerceAdapter auth', () => {
  it('sends the merchant to the Bold Account Center install page with comma-separated scopes', () => {
    const url = new URL(
      new BoldCommerceAdapter(CFG).getAuthUrl('st8', ['read_products', 'read_customers']),
    )
    expect(url.origin + url.pathname).toBe('https://apps.boldapps.net/accounts/dashboard/authorize')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('scope')).toBe('read_products,read_customers')
    expect(url.searchParams.get('redirect_uri')).toBe(CFG.redirectUri)
    expect(url.searchParams.get('state')).toBe('st8')
  })

  it('exchanges the code form-encoded and stores shop_identifier and currency from Get Shop Info', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { token_type: 'bearer', access_token: '2YotnFZFEjr1zCsicMWpAA' } })
    const { calls, create } = fakeBold((path) =>
      path === '/shops/v1/info' ? { id: 3654, shop_identifier: SHOP, currency: 'CAD' } : {},
    )
    const creds = await new BoldCommerceAdapter(CFG).exchangeCode('OoChaiph', CFG.redirectUri)
    const [url, body, cfg] = post.mock.calls[0]!
    expect(url).toBe('https://api.boldcommerce.com/auth/oauth2/token')
    expect(Object.fromEntries(new URLSearchParams(body as string))).toEqual({
      client_id: 'cid',
      grant_type: 'authorization_code',
      client_secret: 'csec',
      code: 'OoChaiph',
    })
    expect((cfg as { headers: Record<string, string> }).headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    expect(calls).toEqual([{ path: '/shops/v1/info', params: undefined }])
    expect(create.mock.calls[0]![0]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer 2YotnFZFEjr1zCsicMWpAA' }),
    })
    expect(creds).toEqual({
      accessToken: '2YotnFZFEjr1zCsicMWpAA',
      extra: { shopIdentifier: SHOP, currency: 'CAD' },
    })
  })

  it('declares Bold’s documented page maximum of 100', () => {
    expect(new BoldCommerceAdapter(CFG).capabilities.maxPageSize).toBe(100)
  })
})

describe('BoldCommerceAdapter host and request shape', () => {
  it('calls api.boldcommerce.com with a Bearer token and the pinned Bold-API-Version-Date', async () => {
    const { create } = fakeBold(() => ({ data: [] }))
    await list(new BoldCommerceAdapter(CFG), 'listCollections', { page: 1, limit: 10 })
    expect(create.mock.calls[0]![0]).toMatchObject({
      baseURL: 'https://api.boldcommerce.com',
      headers: expect.objectContaining({
        Authorization: 'Bearer tok-abc',
        'Bold-API-Version-Date': '2022-05-01',
      }),
    })
  })

  it.each([
    ['listProducts', `/products/v2/shops/${SHOP}/products`, { page: 3, limit: 25, deep: true }],
    ['listVariants', `/products/v2/shops/${SHOP}/variants`, { page: 3, limit: 25 }],
    ['listCollections', `/products/v2/shops/${SHOP}/categories`, { page: 3, limit: 25 }],
    ['listCustomers', `/customers/v2/shops/${SHOP}/customers`, { page: 3, limit: 25 }],
    [
      'listDiscounts',
      `/price_rules/rules/v2/shops/${SHOP}/rulesets`,
      { page: 3, limit: 25, include_all_apps: true },
    ],
  ])('%s sends the caller’s page and limit to %s', async (method, path, expected) => {
    const { calls } = fakeBold(() => ({}))
    await list(new BoldCommerceAdapter(CFG), method, { page: 3, limit: 25 })
    expect(calls).toEqual([{ path, params: expected }])
  })

  it.each(['listProducts', 'listVariants', 'listCollections', 'listCustomers', 'listDiscounts'])(
    '%s clamps a limit above 100 and reports the size it sent',
    async (method) => {
      const { calls } = fakeBold(() => ({}))
      const params = withPageSink({ page: 2, limit: 500 } as QueryParams)
      await list(new BoldCommerceAdapter(CFG), method, params)
      expect(calls[0]!.params).toMatchObject({ page: 2, limit: 100 })
      expect(readUpstreamPage(params)?.pageSize).toBe(100)
    },
  )

  it.each([
    ['listProducts', `/products/v2/shops/${SHOP}/products`],
    ['listCustomers', `/customers/v2/shops/${SHOP}/customers`],
  ])('%s forwards updatedAfter as the documented updated_at_min', async (method, path) => {
    const { calls } = fakeBold(() => ({}))
    await list(new BoldCommerceAdapter(CFG), method, {
      page: 1,
      limit: 10,
      updatedAfter: new Date('2020-01-01T00:00:00Z'),
    })
    expect(calls).toEqual([
      { path, params: expect.objectContaining({ updated_at_min: '2020-01-01T00:00:00.000Z' }) },
    ])
  })

  it('refuses with 501 before any request when the connection has no shop_identifier', async () => {
    const { get } = fakeBold(() => ({}))
    const adapter = new BoldCommerceAdapter(CFG)
    await expect(
      adapter.listProducts({ accessToken: 't' }, { page: 1, limit: 10 }),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })

  it('never defaults a currency: product rows with no stored shop currency throw', async () => {
    fakeBold(() => ({ data: [deepProduct(1)] }))
    await expect(
      new BoldCommerceAdapter(CFG).listProducts(
        { accessToken: 't', extra: { shopIdentifier: SHOP } },
        { page: 1, limit: 10 },
      ),
    ).rejects.toThrow(/currency/)
  })
})

describe('BoldCommerceAdapter paging walks (N = 2L + 1)', () => {
  const L = 4
  const N = 2 * L + 1
  const cases: Array<
    [
      string,
      string,
      (id: number) => unknown,
      (b: { slice: unknown[]; pagination: unknown }) => unknown,
      { parse: (v: unknown) => unknown },
    ]
  > = [
    [
      'listProducts',
      `/products/v2/shops/${SHOP}/products`,
      deepProduct,
      (b) => ({ data: b.slice, pagination: b.pagination }),
      ProductSchema,
    ],
    [
      'listVariants',
      `/products/v2/shops/${SHOP}/variants`,
      variant,
      (b) => ({ data: b.slice, pagination: b.pagination }),
      ProductVariantSchema,
    ],
    [
      'listCollections',
      `/products/v2/shops/${SHOP}/categories`,
      category,
      (b) => ({ data: b.slice, pagination: b.pagination }),
      CollectionSchema,
    ],
    [
      'listCustomers',
      `/customers/v2/shops/${SHOP}/customers`,
      customer,
      (b) => ({ customers: b.slice, pagination: b.pagination }),
      CustomerSchema,
    ],
    [
      'listDiscounts',
      `/price_rules/rules/v2/shops/${SHOP}/rulesets`,
      ruleset,
      (b) => ({ message: 'ok', data: { rulesets: b.slice }, pagination: b.pagination }),
      DiscountSchema,
    ],
  ]

  it.each(cases)(
    '%s serves every row once and reports hasMore exactly',
    async (method, path, make, envelope, schema) => {
      const rows = Array.from({ length: N }, (_, i) => make(i + 1))
      fakeBold((p, params) => {
        expect(p).toBe(path)
        return envelope(servePage(rows, params))
      })
      const adapter = new BoldCommerceAdapter(CFG)
      const seen: string[] = []
      const hasMore: Array<boolean | undefined> = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        const out = await list(adapter, method, params)
        out.forEach((r) => schema.parse(r))
        seen.push(...out.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.totalCount).toBe(N)
      }
      expect(seen).toEqual(rows.map((_, i) => String(i + 1)))
      expect(hasMore).toEqual([true, true, false])
    },
  )

  it('listLocations joins warehouses to their zones and cuts the caller’s page locally', async () => {
    const warehouses = Array.from({ length: N }, (_, i) => ({
      address: '123 Main St.',
      city: 'American Fork',
      province_code: 'UT',
      country_code: 'US',
      postal_code: '84003',
      zone_id: 200 + i,
    }))
    // Zones come back in the reverse order, so only a join on zone_id names
    // each warehouse correctly.
    const zones = warehouses
      .map((w) => ({
        id: w.zone_id,
        name: `Zone ${w.zone_id}`,
        type: 'warehouse',
        enabled: true,
      }))
      .reverse()
    const { calls } = fakeBold((p) =>
      p === `/checkout/shop/${SHOP}/zones/warehouses`
        ? { data: { warehouses } }
        : { data: { zones } },
    )
    const adapter = new BoldCommerceAdapter(CFG)
    const seen: string[] = []
    const names: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const out = await adapter.listLocations(CREDS, params)
      out.forEach((r) => LocationSchema.parse(r))
      seen.push(...out.map((r) => r.id))
      names.push(...out.map((r) => r.name))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(warehouses.map((w) => String(w.zone_id)))
    expect(names).toEqual(warehouses.map((w) => `Zone ${w.zone_id}`))
    expect(hasMore).toEqual([true, true, false])
    expect(new Set(calls.map((c) => c.path))).toEqual(
      new Set([`/checkout/shop/${SHOP}/zones/warehouses`, `/checkout/shop/${SHOP}/zones`]),
    )
    expect(calls.every((c) => c.params === undefined)).toBe(true)
  })
})

describe('BoldCommerceAdapter get methods', () => {
  it('getProduct reads Get Product by ID with deep=true', async () => {
    const { calls } = fakeBold(() => ({ data: deepProduct(123) }))
    const p = await new BoldCommerceAdapter(CFG).getProduct(CREDS, '123')
    expect(calls).toEqual([
      { path: `/products/v2/shops/${SHOP}/products/123`, params: { deep: true } },
    ])
    expect(ProductSchema.parse(p).id).toBe('123')
  })

  it('getVariant filters the shop variants list by id', async () => {
    const { calls } = fakeBold(() => ({ data: [variant(789)] }))
    const v = await new BoldCommerceAdapter(CFG).getVariant(CREDS, '789')
    expect(calls).toEqual([
      { path: `/products/v2/shops/${SHOP}/variants`, params: { filter: 'eq(id:789)' } },
    ])
    expect(ProductVariantSchema.parse(v).id).toBe('789')
  })

  it('getVariant throws 404 when the filter returns no such variant', async () => {
    fakeBold(() => ({ data: [] }))
    await expect(new BoldCommerceAdapter(CFG).getVariant(CREDS, '789')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('getVariant throws 404 when the filter answers with a different variant', async () => {
    fakeBold(() => ({ data: [variant(790)] }))
    await expect(new BoldCommerceAdapter(CFG).getVariant(CREDS, '789')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('getVariant rejects a non-integer id with 404 before sending a filter', async () => {
    const { calls } = fakeBold(() => ({ data: [variant(1)] }))
    await expect(
      new BoldCommerceAdapter(CFG).getVariant(CREDS, '1)+neq(id:0'),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(calls).toEqual([])
  })

  it('getCollection reads Get Category by ID', async () => {
    const { calls } = fakeBold(() => ({ data: category(100) }))
    const c = await new BoldCommerceAdapter(CFG).getCollection(CREDS, '100')
    expect(calls).toEqual([
      { path: `/products/v2/shops/${SHOP}/categories/100`, params: undefined },
    ])
    expect(CollectionSchema.parse(c).id).toBe('100')
  })

  it('getCustomer reads Get Customer by ID from the `customer` key', async () => {
    const { calls } = fakeBold(() => ({ customer: customer(142329453) }))
    const c = await new BoldCommerceAdapter(CFG).getCustomer(CREDS, '142329453')
    expect(calls).toEqual([
      { path: `/customers/v2/shops/${SHOP}/customers/142329453`, params: undefined },
    ])
    expect(CustomerSchema.parse(c).id).toBe('142329453')
  })

  it('getDiscount reads Get Ruleset by ID from data.ruleset', async () => {
    const { calls } = fakeBold(() => ({ message: 'ok', data: { ruleset: ruleset(7) } }))
    const d = await new BoldCommerceAdapter(CFG).getDiscount(CREDS, '7')
    expect(calls).toEqual([
      { path: `/price_rules/rules/v2/shops/${SHOP}/rulesets/7`, params: undefined },
    ])
    expect(DiscountSchema.parse(d).id).toBe('7')
  })

  it('getLocation finds the warehouse by its zone id', async () => {
    fakeBold((p) =>
      p.endsWith('/zones/warehouses')
        ? {
            data: {
              warehouses: [
                { address: '123 Main St.', zone_id: 283 },
                { address: '9 Elm St.', zone_id: 284 },
              ],
            },
          }
        : {
            data: {
              zones: [
                { id: 284, name: 'Eastern Region', type: 'warehouse' },
                { id: 283, name: 'Western Region', type: 'warehouse' },
              ],
            },
          },
    )
    const adapter = new BoldCommerceAdapter(CFG)
    expect((await adapter.getLocation(CREDS, '283')).name).toBe('Western Region')
    expect((await adapter.getLocation(CREDS, '284')).name).toBe('Eastern Region')
    await expect(adapter.getLocation(CREDS, '999')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('BoldCommerceAdapter refusals', () => {
  const lists = [
    'listOrders',
    'listInventoryLevels',
    'listFulfillments',
    'listRefunds',
    'listTransactions',
  ]
  const gets = ['getOrder', 'getFulfillment', 'getRefund', 'getTransaction']

  it.each(lists)('%s throws 501 NOT_SUPPORTED and sends no request', async (method) => {
    const { create, get } = fakeBold(() => ({}))
    await expect(
      list(new BoldCommerceAdapter(CFG), method, { page: 1, limit: 10 }),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(create).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  it.each(gets)('%s throws 501 NOT_SUPPORTED and sends no request', async (method) => {
    const { create, get } = fakeBold(() => ({}))
    const adapter = new BoldCommerceAdapter(CFG)
    const fn = (
      adapter as unknown as Record<string, (c: Credentials, id: string) => Promise<unknown>>
    )[method]!
    await expect(fn.call(adapter, CREDS, '1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(create).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })
})
