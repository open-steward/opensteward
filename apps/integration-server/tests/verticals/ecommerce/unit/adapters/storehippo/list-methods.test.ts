/**
 * StoreHippo read methods: host and auth, request shape, paging walks and
 * refusals.
 *
 * From the API overview (https://help.storehippo.com/api):
 *   "How to call": url "https://{storename}.storehippo.com/api/1.1/entity/ms.products",
 *                  headers { "access-key": "{access-key}" }
 *   "Pagination":  limit "Default Value : 50" "A limit on the number of records to be returned."
 *                  start "Default Value : 0" "A limit on the number of records to be skipped before returning."
 *   "paging":      "It contains the paging detail like start, limit, count, total etc"
 *   "Filtering":   "Every filter in the filters array has field, operator(optional) and value fields."
 * Entity list/get commands: https://help.storehippo.com/api/reference/<alias>.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { _resetRowPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { StorehippoAdapter } from '../../../../../../src/verticals/ecommerce/adapters/storehippo/index'
import {
  CATEGORY,
  COUPON_CODE,
  DEFAULT_CURRENCY,
  FULFILLMENT,
  ORDER,
  PRODUCT,
  REFUND,
  STORE_LOCATION,
  USER,
} from './fixtures'

const CREDS = { accessToken: 'sh_test_key', extra: { storename: 'mystore' } }
/** A second store currency with the `default` flag clear. */
const OTHER_CURRENCY = { _id: '5d4d57acb6455f39d99da5f9', name: 'USD', default: 0 }

const BASE: Record<string, Record<string, unknown>> = {
  'ms.products': PRODUCT,
  'ms.categories': CATEGORY,
  'ms.users': USER,
  'ms.orders': ORDER,
  'ms.coupon_codes': COUPON_CODE,
  'ms.fulfillments': FULFILLMENT,
  'ms.refunds': REFUND,
  'ms.store_locations': STORE_LOCATION,
}

/** Variants on product i: 0, 1 or 2, so product pages hold uneven numbers of variants. */
function variantCount(i: number, store = 'mystore'): number {
  return store === 'otherstore' ? (i + 1) % 3 : i % 3
}

/**
 * Rows of one entity. Orders carry display numbers `OID-<i>` in `order_id`,
 * and refund i names order i by that number. Stores other than `mystore`
 * prefix their ids with the store name.
 */
function rowsFor(entity: string, total: number, store = 'mystore'): Record<string, unknown>[] {
  const prefix = store === 'mystore' ? '' : `${store}-`
  return Array.from({ length: total }, (_, i) => {
    const row: Record<string, unknown> = {
      ...structuredClone(BASE[entity]!),
      _id: `${prefix}${entity}-${i}`,
    }
    if (entity === 'ms.orders' || entity === 'ms.refunds') row['order_id'] = `OID-${i}`
    if (entity === 'ms.products') {
      const base = (PRODUCT.variants as Record<string, unknown>[])[0]!
      row['variants'] = Array.from({ length: variantCount(i, store) }, (_, k) => ({
        ...structuredClone(base),
        variant_id: `v${k}`,
      }))
    }
    return row
  })
}

interface Sent {
  path: string
  params: Record<string, unknown>
}

interface Written {
  method: 'post' | 'put'
  path: string
}

interface FakeOptions {
  /** A server-side page cap: `paging.limit` echoes it when the request asks for more. */
  cap?: number
  /** The ms.currencies records; by default one clear and one with `default` set. */
  currencies?: Record<string, unknown>[]
  /** How many ms.orders rows exist, when not `total`. */
  orders?: number
}

/**
 * A fake StoreHippo store that honours only the documented list parameters
 * (`start`, `limit`, `filters`), answers only the documented entity paths,
 * and refuses a request without the access-key header.
 */
function fakeStoreHippo(total: number, opts: FakeOptions = {}) {
  const sent: Sent[] = []
  const writes: Written[] = []
  type Cfg = { baseURL?: string; headers?: Record<string, string> }
  let createConfig: Cfg | undefined
  const get = vi.fn(
    async (path: string, config: { params?: Record<string, unknown> } | undefined, client: Cfg) => {
      const params = config?.params ?? {}
      sent.push({ path, params })
      if (client.headers?.['access-key'] !== 'sh_test_key') {
        throw Object.assign(new Error('401'), { status: 401 })
      }
      const m = /^\/entity\/([a-z._]+)(?:\/(.+))?$/.exec(path)
      if (!m) throw Object.assign(new Error(`404 ${path}`), { status: 404 })
      const [, entity, id] = m as unknown as [string, string, string | undefined]
      const store = /^https:\/\/([a-z]+)\.storehippo\.com/.exec(client.baseURL ?? '')?.[1]
      let all: Record<string, unknown>[]
      if (entity === 'ms.currencies') {
        all = structuredClone(opts.currencies ?? [OTHER_CURRENCY, DEFAULT_CURRENCY]) as Record<
          string,
          unknown
        >[]
      } else if (BASE[entity]) {
        all = rowsFor(entity, entity === 'ms.orders' ? (opts.orders ?? total) : total, store)
      } else {
        throw Object.assign(new Error(`Entity Struct not found`), { status: 404 })
      }
      if (id !== undefined) {
        if (Object.keys(params).length > 0) throw new Error('get takes no params')
        const row = all.find((r) => r['_id'] === decodeURIComponent(id))
        if (!row) throw Object.assign(new Error('404'), { status: 404 })
        return { data: { data: row } }
      }
      const unknown = Object.keys(params).filter((k) => !['start', 'limit', 'filters'].includes(k))
      if (unknown.length > 0) throw Object.assign(new Error(`unknown ${unknown}`), { status: 400 })
      if (params['filters'] !== undefined) {
        // Documented: field, operator (optional; equal by default), value; `in` takes an array.
        const filters = JSON.parse(params['filters'] as string) as {
          field: string
          operator?: string
          value: unknown
        }[]
        for (const f of filters) {
          if (f.operator === 'in' && Array.isArray(f.value)) {
            const values = f.value
            all = all.filter((r) => values.includes(r[f.field]))
          } else if (f.operator === undefined || f.operator === 'equal') {
            all = all.filter((r) => r[f.field] === f.value)
          } else {
            throw Object.assign(new Error('unsupported filter'), { status: 400 })
          }
        }
      }
      const start = params['start'] as number
      const asked = params['limit'] as number
      if (!Number.isInteger(start) || start < 0 || !Number.isInteger(asked) || asked < 1) {
        throw Object.assign(new Error('bad start/limit'), { status: 400 })
      }
      const limit = opts.cap !== undefined ? Math.min(asked, opts.cap) : asked
      const data = all.slice(start, start + limit)
      // Observed live (triage): total is start + count, not the collection size.
      return {
        data: {
          messages: [{ name: `ms.entity.${entity}.list`, level: 'success' }],
          data,
          paging: { limit, start, count: data.length, total: start + data.length },
        },
      }
    },
  )
  vi.spyOn(axios, 'create').mockImplementation(((config: Cfg) => {
    createConfig = config
    const write = (method: 'post' | 'put') => async (path: string, body: { data: unknown }) => {
      writes.push({ method, path })
      return { data: { data: { _id: 'written', ...(body.data as Record<string, unknown>) } } }
    }
    return {
      get: (path: string, cfg?: { params?: Record<string, unknown> }) => get(path, cfg, config),
      post: write('post'),
      put: write('put'),
    } as unknown as ReturnType<typeof axios.create>
  }) as unknown as typeof axios.create)
  return { sent, writes, config: () => createConfig }
}

const adapter = () => new StorehippoAdapter()

function params(page: number, limit: number, extra: Record<string, unknown> = {}): QueryParams {
  return withPageSink({ page, limit, ...extra } as QueryParams)
}

type OffsetMethod =
  | 'listProducts'
  | 'listCollections'
  | 'listCustomers'
  | 'listOrders'
  | 'listDiscounts'
  | 'listFulfillments'
  | 'listRefunds'
  | 'listLocations'

const ENTITY_OF: Record<OffsetMethod, string> = {
  listProducts: 'ms.products',
  listCollections: 'ms.categories',
  listCustomers: 'ms.users',
  listOrders: 'ms.orders',
  listDiscounts: 'ms.coupon_codes',
  listFulfillments: 'ms.fulfillments',
  listRefunds: 'ms.refunds',
  listLocations: 'ms.store_locations',
}
const OFFSET_METHODS = Object.keys(ENTITY_OF) as OffsetMethod[]

async function walk(method: OffsetMethod | 'listVariants', pages: number, limit: number) {
  const a = adapter()
  const seen: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (let page = 1; page <= pages; page++) {
    const p = params(page, limit)
    const rows = await a[method](CREDS, p)
    seen.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(p)?.hasMore)
  }
  return { seen, hasMore }
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe('client', () => {
  it('calls https://{storename}.storehippo.com/api/1.1 with the access-key header', async () => {
    const fake = fakeStoreHippo(1)
    await adapter().listCollections(CREDS, params(1, 10))
    expect(fake.config()?.baseURL).toBe('https://mystore.storehippo.com/api/1.1')
    expect(fake.config()?.headers?.['access-key']).toBe('sh_test_key')
  })
})

describe('request shape', () => {
  it.each(OFFSET_METHODS)(
    '%s sends the caller offset as start and the caller limit',
    async (method) => {
      const fake = fakeStoreHippo(40)
      await adapter()[method](CREDS, params(3, 7))
      const lists = fake.sent.filter((s) => s.path === `/entity/${ENTITY_OF[method]}`)
      expect(lists).toEqual([
        { path: `/entity/${ENTITY_OF[method]}`, params: { start: 14, limit: 7 } },
      ])
    },
  )

  it.each(['listProducts', 'listDiscounts'] as const)(
    '%s prices in the one store currency whose default flag is set',
    async (method) => {
      const fake = fakeStoreHippo(3)
      const rows = await adapter()[method](CREDS, params(1, 10))
      expect(fake.sent).toContainEqual({
        path: '/entity/ms.currencies',
        params: { start: 0, limit: 50 },
      })
      expect(JSON.stringify(rows)).toContain('"currency":"INR"')
      expect(JSON.stringify(rows)).not.toContain('"currency":"USD"')
    },
  )

  it('reads the default flag as a number or a numeric string', async () => {
    fakeStoreHippo(3, { currencies: [OTHER_CURRENCY, { ...DEFAULT_CURRENCY, default: '1' }] })
    const rows = await adapter().listDiscounts(CREDS, params(1, 10))
    expect(JSON.stringify(rows)).toContain('"currency":"INR"')
  })

  it('walks every currency page before choosing', async () => {
    const clear = Array.from({ length: 50 }, (_, i) => ({ ...OTHER_CURRENCY, _id: `c${i}` }))
    const fake = fakeStoreHippo(3, { currencies: [...clear, DEFAULT_CURRENCY] })
    const rows = await adapter().listDiscounts(CREDS, params(1, 10))
    expect(JSON.stringify(rows)).toContain('"currency":"INR"')
    expect(
      fake.sent.filter((s) => s.path === '/entity/ms.currencies').map((s) => s.params),
    ).toEqual([
      { start: 0, limit: 50 },
      { start: 50, limit: 50 },
    ])
  })

  it.each([
    ['no', [OTHER_CURRENCY]],
    ['two', [DEFAULT_CURRENCY, { ...OTHER_CURRENCY, default: 1 }]],
  ] as const)(
    'listProducts refuses to price variants when %s currencies have the default flag',
    async (_n, currencies) => {
      fakeStoreHippo(3, { currencies: [...currencies] })
      await expect(adapter().listProducts(CREDS, params(1, 10))).rejects.toThrow(/default currency/)
    },
  )

  it('listProducts sends the documented default limit of 50 when the caller gives none', async () => {
    const fake = fakeStoreHippo(3)
    await adapter().listProducts(CREDS, withPageSink({ page: 1 } as QueryParams))
    expect(fake.sent[0]).toEqual({ path: '/entity/ms.products', params: { start: 0, limit: 50 } })
  })

  it('ignores updatedAfter, which no list documents', async () => {
    const fake = fakeStoreHippo(3)
    await adapter().listOrders(CREDS, params(1, 10, { updatedAfter: new Date('2026-01-01') }))
    expect(fake.sent[0]?.params).toEqual({ start: 0, limit: 10 })
  })
})

describe('paging walk (N = 2L + 1)', () => {
  it.each(OFFSET_METHODS)('%s serves every row once with an exact end', async (method) => {
    fakeStoreHippo(11)
    const { seen, hasMore } = await walk(method, 3, 5)
    const ids = rowsFor(ENTITY_OF[method], 11).map((r) => r['_id'])
    expect(seen).toEqual(ids)
    expect(hasMore).toEqual([true, true, false])
  })

  it('a full last page reports more, and the next page is empty with no more', async () => {
    fakeStoreHippo(10)
    const { seen, hasMore } = await walk('listOrders', 3, 5)
    expect(seen).toHaveLength(10)
    expect(hasMore).toEqual([true, true, false])
  })

  it('re-cuts at the page size the server says it served, skipping nothing', async () => {
    const fake = fakeStoreHippo(30, { cap: 4 })
    const a = adapter()
    const p1 = params(1, 10)
    const first = await a.listCustomers(CREDS, p1)
    expect(first.map((c) => c.id)).toEqual(['ms.users-0', 'ms.users-1', 'ms.users-2', 'ms.users-3'])
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true, pageSize: 4 })
    const p2 = params(2, 10)
    const second = await a.listCustomers(CREDS, p2)
    expect(second.map((c) => c.id)).toEqual([
      'ms.users-4',
      'ms.users-5',
      'ms.users-6',
      'ms.users-7',
    ])
    expect(fake.sent.slice(1).map((s) => s.params)).toEqual([
      { start: 10, limit: 10 },
      { start: 4, limit: 4 },
    ])
  })
})

describe('refunds resolve order_id to Order.id', () => {
  it('maps each refund to the _id of the order with that display number, in one in-filter call', async () => {
    const fake = fakeStoreHippo(11)
    const refunds = await adapter().listRefunds(CREDS, params(2, 5))
    expect(refunds.map((r) => [r.id, r.orderId])).toEqual(
      [5, 6, 7, 8, 9].map((i) => [`ms.refunds-${i}`, `ms.orders-${i}`]),
    )
    expect(fake.sent.filter((s) => s.path === '/entity/ms.orders')).toEqual([
      {
        path: '/entity/ms.orders',
        params: {
          start: 0,
          limit: 5,
          filters: JSON.stringify([
            {
              field: 'order_id',
              operator: 'in',
              value: ['OID-5', 'OID-6', 'OID-7', 'OID-8', 'OID-9'],
            },
          ]),
        },
      },
    ])
  })

  it('getRefund resolves the same way', async () => {
    fakeStoreHippo(3)
    const r = await adapter().getRefund(CREDS, 'ms.refunds-2')
    expect(r.orderId).toBe('ms.orders-2')
  })

  it('throws when no order carries the refund order_id', async () => {
    // 3 orders, but refund 3 names OID-3.
    fakeStoreHippo(4, { orders: 3 })
    await expect(adapter().getRefund(CREDS, 'ms.refunds-3')).rejects.toThrow(/OID-3/)
  })
})

describe('writes read the store currency before writing', () => {
  it.each([
    ['createProduct', () => adapter().createProduct(CREDS, { title: 'x' })],
    ['updateProduct', () => adapter().updateProduct(CREDS, 'ms.products-1', { title: 'x' })],
    ['createDiscount', () => adapter().createDiscount(CREDS, { code: 'X' })],
    ['updateDiscount', () => adapter().updateDiscount(CREDS, 'd1', { code: 'X' })],
    ['updateVariant', () => adapter().updateVariant(CREDS, 'ms.products-2:v0', {})],
  ] as const)('%s writes nothing when the currency cannot be read', async (_name, call) => {
    const fake = fakeStoreHippo(3, { currencies: [OTHER_CURRENCY] })
    await expect(call()).rejects.toThrow(/default currency/)
    expect(fake.writes).toEqual([])
  })

  it('createRefund writes nothing without an orderId, and reports the caller orderId', async () => {
    const fake = fakeStoreHippo(3)
    await expect(adapter().createRefund(CREDS, {})).rejects.toThrow(/orderId/)
    expect(fake.writes).toEqual([])
    const r = await adapter().createRefund(CREDS, { orderId: 'ms.orders-1' })
    expect(r.orderId).toBe('ms.orders-1')
  })
})

describe('listVariants', () => {
  it('without productId: pageByRows over 50-product pages, every variant once, exact end', async () => {
    // 60 products: an uneven second upstream page of 10, and 0-2 variants per product.
    const fake = fakeStoreHippo(60)
    const expected = rowsFor('ms.products', 60).flatMap((p) =>
      (p['variants'] as { variant_id: string }[]).map((v) => `${p['_id']}:${v.variant_id}`),
    )
    expect(expected).toHaveLength(60)
    const limit = 7
    const pages = Math.ceil(expected.length / limit)
    const { seen, hasMore } = await walk('listVariants', pages, limit)
    expect(seen).toEqual(expected)
    expect(hasMore).toEqual([...Array(pages - 1).fill(true), false])
    const productPages = fake.sent.filter((s) => s.path === '/entity/ms.products')
    expect(productPages.map((s) => s.params)).toEqual([
      { start: 0, limit: 50 },
      { start: 50, limit: 50 },
    ])
  })

  it('keeps separate walks for two stores that share an access key', async () => {
    fakeStoreHippo(60)
    const a = adapter()
    const other = { accessToken: 'sh_test_key', extra: { storename: 'otherstore' } }
    await a.listVariants(CREDS, params(1, 7))
    const page2 = await a.listVariants(other, params(2, 7))
    const expected = rowsFor('ms.products', 60, 'otherstore').flatMap((p) =>
      (p['variants'] as { variant_id: string }[]).map((v) => `${p['_id']}:${v.variant_id}`),
    )
    expect(page2.map((v) => v.id)).toEqual(expected.slice(7, 14))
  })

  it('with productId: reads that product and slices its variants locally', async () => {
    const fake = fakeStoreHippo(3)
    const p = params(1, 1, { productId: 'ms.products-2' })
    const rows = await adapter().listVariants(CREDS, p)
    expect(rows.map((v) => v.id)).toEqual(['ms.products-2:v0'])
    expect(readUpstreamPage(p)).toMatchObject({ hasMore: true, pagedLocally: true })
    expect(fake.sent[0]).toEqual({ path: '/entity/ms.products/ms.products-2', params: {} })
  })

  it('getVariant reads the parent product and matches variant_id', async () => {
    fakeStoreHippo(3)
    const v = await adapter().getVariant(CREDS, 'ms.products-2:v1')
    expect(v).toMatchObject({ id: 'ms.products-2:v1', productId: 'ms.products-2' })
    await expect(adapter().getVariant(CREDS, 'ms.products-2:v9')).rejects.toThrow(/not found/)
  })
})

describe('get methods read the documented {resource_id} paths', () => {
  it.each([
    ['getProduct', 'ms.products'],
    ['getCollection', 'ms.categories'],
    ['getCustomer', 'ms.users'],
    ['getOrder', 'ms.orders'],
    ['getDiscount', 'ms.coupon_codes'],
    ['getFulfillment', 'ms.fulfillments'],
    ['getRefund', 'ms.refunds'],
    ['getLocation', 'ms.store_locations'],
  ] as const)('%s → /entity/%s/{id}', async (method, entity) => {
    const fake = fakeStoreHippo(2)
    const row = await adapter()[method](CREDS, `${entity}-1`)
    expect(row.id).toBe(`${entity}-1`)
    expect(fake.sent[0]).toEqual({ path: `/entity/${entity}/${entity}-1`, params: {} })
  })
})

describe('get encodes the id into one path segment', () => {
  it('escapes / and ? in a caller id', async () => {
    const fake = fakeStoreHippo(2)
    await expect(adapter().getOrder(CREDS, 'a/b?c')).rejects.toThrow()
    expect(fake.sent[0]?.path).toBe('/entity/ms.orders/a%2Fb%3Fc')
  })
})

describe('refusals send nothing', () => {
  it.each([
    ['listTransactions', () => adapter().listTransactions(CREDS, params(1, 10))],
    ['getTransaction', () => adapter().getTransaction(CREDS, 't1')],
    ['listInventoryLevels', () => adapter().listInventoryLevels(CREDS, params(1, 10))],
    ['getInventoryLevel', () => adapter().getInventoryLevel(CREDS, 'p1:v1')],
  ] as const)('%s throws 501 NOT_SUPPORTED', async (_name, call) => {
    const fake = fakeStoreHippo(3)
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(fake.sent).toEqual([])
  })
})
