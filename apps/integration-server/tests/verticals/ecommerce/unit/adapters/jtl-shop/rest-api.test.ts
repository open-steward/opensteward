/**
 * JTL-Shop list and read methods against the REST API's own routes and paging.
 *
 * Source: JTL-Software's jtl-shop/core at tag v5.8.0 (JTL publishes no
 * rendered REST reference; the controllers carry the OpenAPI annotations).
 *
 * Routes (registerRoutes() in includes/src/REST/Controllers):
 *   "$routeGroup->get('/product', $this->index(...));"
 *   "$routeGroup->get('/category', $this->index(...));"
 *   "$routeGroup->get('/customer', $this->index(...));"
 *   "$routeGroup->get('/order', $this->index(...));"
 *   "$routeGroup->get('/stock/product/{productID}', $this->show(...));"
 *
 * Paging (AbstractController::index, copied into CustomerController::index):
 *   "$limit          = \max(1, (int)($request->getQueryParams()['limit'] ?? 10));"
 *   "$currentCursor  = (int)($request->getQueryParams()['cursor'] ?? 0);"
 *   "' WHERE ' . $primary . ' > :lid LIMIT :lmt'"
 *   "$newCursor = $all->last()->$primary ?? -1;"
 * answered as a league/fractal collection: { data: [...], meta: { cursor:
 * { current, prev, next, count } } }.
 *
 * The fake below implements exactly that and refuses any other query key, so
 * a request that still sends `offset`, `modifiedAfter` or `search` fails.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'
import { JtlShopAdapter } from '../../../../../../src/verticals/ecommerce/adapters/jtl-shop/index'
import { CustomerSchema } from '../../../../../../src/verticals/ecommerce/schema/customer'

const CREDS = { accessToken: 'jtl-key', extra: { baseUrl: 'https://shop.example.de' } }

type Row = Record<string, unknown>

/** Primary keys with gaps, so a page number or row offset sent as `cursor` would be caught. */
function pks(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 100 + i * 3)
}

const ROWS: Record<string, (id: number) => Row> = {
  product: (id) => ({ id, name: `Artikel ${id}`, sku: `A-${id}`, slug: `artikel-${id}` }),
  category: (id) => ({ id, name: `Kategorie ${id}`, parentID: 0, slug: `kategorie-${id}` }),
  customer: (id) => ({ id, firstname: 'Erika', surname: 'Mustermann', mail: `k${id}@example.de` }),
  order: (id) => ({ id, orderNO: `B-${id}`, customerID: 7 }),
}

interface Sent {
  path: string
  params: Record<string, unknown>
}

function fakeJtl(counts: Partial<Record<string, number>>, extra: Record<string, unknown> = {}) {
  const sent: Sent[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = { ...(config?.params ?? {}) }
    sent.push({ path, params })
    if (path in extra) return { data: extra[path] }
    const make = ROWS[path]
    if (!make || counts[path] === undefined) {
      throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
    }
    const unknown = Object.keys(params).filter(
      (k) => k !== 'limit' && k !== 'cursor' && k !== 'previous',
    )
    if (unknown.length > 0) throw new Error(`the index never reads: ${unknown.join(',')}`)
    const limit = Math.max(1, Math.trunc(Number(params['limit'] ?? 10)) || 1)
    const cursor = Math.trunc(Number(params['cursor'] ?? 0)) || 0
    const all = pks(counts[path]!)
    const page = (cursor > 0 ? all.filter((pk) => pk > cursor) : all).slice(0, limit)
    return {
      data: {
        data: page.map(make),
        meta: {
          cursor: {
            current: cursor,
            prev: 0,
            // The last row's raw primary-key column, fetched with
            // "$options[PDO::ATTR_STRINGIFY_FETCHES] = true;" (NiceDB.php), so a
            // decimal string; only the empty-page fallback -1 is an int.
            next: page.length > 0 ? String(page[page.length - 1]) : -1,
            count: page.length,
          },
        },
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    defaults: { headers: {} },
  } as unknown as ReturnType<typeof axios.create>)
  return { sent, get }
}

const LISTS = [
  ['listProducts', 'product'],
  ['listCollections', 'category'],
  ['listCustomers', 'customer'],
  ['listOrders', 'order'],
] as const

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('JTL-Shop keyset lists', () => {
  describe.each(LISTS)('%s → GET /%s', (method, path) => {
    it.each([10, 7])(
      'N = 2L + 1 rows walked like the sync (limit %i) serve every id once with exact hasMore',
      async (limit) => {
        const n = 2 * limit + 1
        const { sent } = fakeJtl({ [path]: n })
        const adapter = new JtlShopAdapter()
        const seen: string[] = []
        const hasMore: (boolean | undefined)[] = []
        for (const page of [1, 2, 3]) {
          const params = withPageSink({ page, limit })
          const rows = await adapter[method](CREDS, params)
          seen.push(...rows.map((r) => r.id))
          hasMore.push(readUpstreamPage(params)?.hasMore)
        }
        expect(seen).toEqual(pks(n).map(String))
        expect(new Set(seen).size).toBe(n)
        expect(hasMore).toEqual([true, true, false])
        const all = pks(n)
        expect(sent).toEqual([
          { path, params: { limit } },
          { path, params: { limit, cursor: all[limit - 1] } },
          { path, params: { limit, cursor: all[2 * limit - 1] } },
        ])
      },
    )

    it('a full last page (N = 2L) is followed by an empty page that ends the walk', async () => {
      const limit = 5
      fakeJtl({ [path]: 2 * limit })
      const adapter = new JtlShopAdapter()
      const hasMore: (boolean | undefined)[] = []
      const seen: string[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit })
        seen.push(...(await adapter[method](CREDS, params)).map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(pks(2 * limit).map(String))
      expect(hasMore).toEqual([true, true, false])
    })

    it('a cold jump to page 3 walks the cursor chain from page 1', async () => {
      const { sent } = fakeJtl({ [path]: 25 })
      const rows = await new JtlShopAdapter()[method](CREDS, withPageSink({ page: 3, limit: 10 }))
      expect(rows.map((r) => r.id)).toEqual(pks(25).slice(20).map(String))
      expect(sent.map((s) => s.params['cursor'])).toEqual([undefined, pks(25)[9], pks(25)[19]])
    })

    it('without a usable limit sends the documented default of 10', async () => {
      const { sent } = fakeJtl({ [path]: 30 })
      await new JtlShopAdapter()[method](CREDS, withPageSink({}))
      await new JtlShopAdapter()[method](CREDS, withPageSink({ page: 1, limit: 0 }))
      expect(sent.map((s) => s.params)).toEqual([{ limit: 10 }, { limit: 10 }])
    })

    it('sends neither search nor updatedAfter, which the index never reads', async () => {
      const { sent } = fakeJtl({ [path]: 3 })
      await new JtlShopAdapter()[method](
        CREDS,
        withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
      )
      expect(sent).toEqual([{ path, params: { limit: 10 } }])
    })
  })

  it('the API path (parseListQuery then listPage) reports meta.hasMore from the cursor walk', async () => {
    fakeJtl({ order: 25 })
    const a = new JtlShopAdapter()
    const p2 = parseListQuery({ page: '2', limit: '10' }, a as EcommerceAdapter)
    const env2 = listPage(await a.listOrders(CREDS, p2), p2, 'jtl-shop')
    expect(env2.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ page: '3', limit: '10' }, a as EcommerceAdapter)
    const env3 = listPage(await a.listOrders(CREDS, p3), p3, 'jtl-shop')
    expect(env3.data.map((r) => r.id)).toEqual(pks(25).slice(20).map(String))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('does not declare search, so the router refuses it', () => {
    expect(new JtlShopAdapter().capabilities.search).toBe(false)
  })

  it('also accepts a numeric meta.cursor.next', async () => {
    fakeJtl({}, { product: { data: [{ id: 5, name: 'a' }], meta: { cursor: { next: 5 } } } })
    const params = withPageSink({ page: 1, limit: 1 })
    const rows = await new JtlShopAdapter().listProducts(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['5'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('keys the cursor chain by limit: a page at another limit re-walks, never reuses cursors', async () => {
    const { sent } = fakeJtl({ product: 30 })
    const adapter = new JtlShopAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 5 }))
    await adapter.listProducts(CREDS, withPageSink({ page: 2, limit: 5 }))
    sent.length = 0
    const rows = await adapter.listProducts(CREDS, withPageSink({ page: 2, limit: 7 }))
    expect(rows.map((r) => r.id)).toEqual(pks(30).slice(7, 14).map(String))
    expect(sent.map((s) => s.params)).toEqual([{ limit: 7 }, { limit: 7, cursor: pks(30)[6] }])
  })

  it('keys the cursor chain by credential: a second connection to the same shop re-walks', async () => {
    const { sent } = fakeJtl({ product: 30 })
    const adapter = new JtlShopAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 5 }))
    sent.length = 0
    const other = { ...CREDS, accessToken: 'other-key' }
    await adapter.listProducts(other, withPageSink({ page: 2, limit: 5 }))
    expect(sent.map((s) => s.params)).toEqual([{ limit: 5 }, { limit: 5, cursor: pks(30)[4] }])
  })

  it('sends a large caller limit unclamped (no maximum is documented)', async () => {
    const { sent } = fakeJtl({ product: 3 })
    await new JtlShopAdapter().listProducts(CREDS, withPageSink({ page: 1, limit: 500 }))
    expect(sent.map((s) => s.params)).toEqual([{ limit: 500 }])
  })

  it.each([undefined, -1, 0, '-1', '0', '', '12a', '1.5', 1.5])(
    'a full page whose meta.cursor.next is %s is an error, not a silent end or a restart',
    async (next) => {
      fakeJtl({}, { product: { data: [{ id: 1, name: 'a' }], meta: { cursor: { next } } } })
      await expect(
        new JtlShopAdapter().listProducts(CREDS, withPageSink({ page: 1, limit: 1 })),
      ).rejects.toThrow(/meta\.cursor\.next/)
    },
  )

  it('a body without the fractal data array is an error, not an empty page', async () => {
    fakeJtl({}, { product: { status: 'ok' } })
    await expect(
      new JtlShopAdapter().listProducts(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/collection envelope/)
  })
})

describe('JTL-Shop single-record reads', () => {
  it.each([
    ['getProduct', 'product/104', { id: 104, name: 'Artikel' }],
    ['getCollection', 'category/104', { id: 104, name: 'Kategorie' }],
    ['getOrder', 'order/104', { id: 104, orderNO: 'B-104' }],
  ] as const)('%s reads GET /%s and unwraps { data }', async (method, route, model) => {
    const { sent } = fakeJtl({}, { [route]: { data: model } })
    const out = await new JtlShopAdapter()[method](CREDS, '104')
    expect(out.id).toBe('104')
    expect(sent).toEqual([{ path: route, params: {} }])
  })

  it('getCustomer reads GET /customer/{id} and leaves out the fields show() does not decrypt', async () => {
    const { sent } = fakeJtl(
      {},
      {
        'customer/9': {
          data: {
            id: 9,
            firstname: 'Erika',
            surname: 'CIPHERTEXT==',
            company: 'CIPHERTEXT==',
            street: 'CIPHERTEXT==',
            streetNO: '5',
            city: 'Köln',
            zip: '50667',
            mail: 'erika@example.de',
            password: '$2y$10$hash',
          },
        },
      },
    )
    const out = CustomerSchema.parse(await new JtlShopAdapter().getCustomer(CREDS, '9'))
    expect(sent).toEqual([{ path: 'customer/9', params: {} }])
    expect(out.lastName).toBeUndefined()
    expect(out.defaultAddress?.line1).toBeUndefined()
    expect(out.defaultAddress?.city).toBe('Köln')
    expect(JSON.stringify(out)).not.toContain('CIPHERTEXT')
    expect(JSON.stringify(out)).not.toContain('$2y$10$hash')
  })

  it('listCustomers maps the decrypted surname and street from the index', async () => {
    fakeJtl({ customer: 1 })
    const [c] = await new JtlShopAdapter().listCustomers(
      CREDS,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(c!.lastName).toBe('Mustermann')
  })
})

describe('JTL-Shop listInventoryLevels → GET /stock/product/{productID}', () => {
  const stock = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      productID: 42,
      warehouseID: i + 1,
      stock: 10 + i,
      procured: 0,
      procuredDate: null,
    }))

  it('pages the whole per-product collection locally, every row once, with exact hasMore', async () => {
    const limit = 3
    const n = 2 * limit + 1
    const { sent } = fakeJtl({}, { 'stock/product/42': { data: stock(n) } })
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit, product_id: '42' })
      seen.push(...(await new JtlShopAdapter().listInventoryLevels(CREDS, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(stock(n).map((s) => `42:${s.warehouseID}`))
    expect(hasMore).toEqual([true, true, false])
    expect(
      sent.every((s) => s.path === 'stock/product/42' && Object.keys(s.params).length === 0),
    ).toBe(true)
  })

  it('a per-product body without the data array is an error, not an empty (complete) list', async () => {
    fakeJtl({}, { 'stock/product/42': { status: 'ok' } })
    await expect(
      new JtlShopAdapter().listInventoryLevels(
        CREDS,
        withPageSink({ page: 1, limit: 10, product_id: '42' }),
      ),
    ).rejects.toThrow(/collection envelope/)
  })

  it('refuses an unfiltered call with 501 before sending anything (GET /stock has no cursor)', async () => {
    const { get } = fakeJtl({})
    await expect(
      new JtlShopAdapter().listInventoryLevels(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('JTL-Shop resources with no REST route are refused before any request', () => {
  it.each([
    ['listVariants', /cannot list variants/],
    ['listFulfillments', /cannot list fulfillments/],
    ['listRefunds', /cannot list refunds/],
    ['listDiscounts', /cannot list discounts/],
  ] as const)('%s throws 501 NOT_SUPPORTED', async (method, message) => {
    const { get } = fakeJtl({})
    const adapter = new JtlShopAdapter()
    const params = withPageSink({ page: 1, limit: 10, product_id: '1', order_id: '1' })
    const err = await adapter[method](CREDS, params).catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(message)
    expect(get).not.toHaveBeenCalled()
  })

  it.each(['getVariant', 'getFulfillment', 'getRefund', 'getDiscount'] as const)(
    '%s throws 501 NOT_SUPPORTED',
    async (method) => {
      const { get } = fakeJtl({})
      await expect(new JtlShopAdapter()[method](CREDS, '1:2')).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
      expect(get).not.toHaveBeenCalled()
    },
  )
})
