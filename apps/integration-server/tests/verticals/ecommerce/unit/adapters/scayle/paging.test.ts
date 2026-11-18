/**
 * SCAYLE list paging contract.
 *
 * SCAYLE's Admin API specs (e.g.
 * https://scayle.dev/open_api_specs/admin-api-latest/products_get.json) page
 * every list by an opaque cursor: request params `limit` and `cursor`
 * ("Valid cursor used for pagination."), response `{ entities, cursor: { next } }`
 * where `cursor.next` is "The cursor pointing to the next page. If null there
 * is no next page available."
 *
 * `limit` is at most 1000 (default 100) on products, product variants, shop
 * categories, warehouses, customers and promotions, and at most 100 (default
 * 10) on orders. With `with=variants` the limit "always applies to the amount
 * of parent entities", and the spec asks for 100 or lower there.
 *
 * - products, variants of one product, collections, locations, customers,
 *   orders, discounts: one upstream page is one caller page (pageByCursor).
 * - variants without a productId (flattened out of products?with=variants):
 *   one upstream page is not one caller page (pageByRows).
 *
 * The fake upstream honours only `limit`, `cursor` and `with`, and rejects a
 * `limit` above the endpoint's documented maximum as the real one would.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { Credentials, PageMaxBearing, QueryParams } from '@opensteward/shared'
import { ScayleAdapter } from '../../../../../../src/verticals/ecommerce/adapters/scayle/index'

const CREDS: Credentials = {
  accessToken: 'scayle-key',
  extra: { tenantSpace: 'acme-live', shopKey: 'shop-1', countryCode: 'DE' },
}

/** The router hands parseListQuery the adapter as it is registered; SCAYLE declares no maximum. */
const routed = (adapter: object): PageMaxBearing => adapter

type Raw = Record<string, unknown>

interface Call {
  path: string
  params: Record<string, unknown>
}

const ORDERS = '/shops/shop-1/countries/DE/orders'
const maxFor = (path: string): number => (path === ORDERS ? 100 : 1000)
const defaultFor = (path: string): number => (path === ORDERS ? 10 : 100)

/** An opaque cursor, minted by one account's server; any other account rejects it. */
function cursorFor(path: string, offset: number, account = 'acme'): string {
  return Buffer.from(`${account}|${path}|${offset}`).toString('base64')
}

function makeServer(data: Partial<Record<string, Raw[]>>, account = 'acme') {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params })
    const rows = data[path]
    if (!rows) throw new Error(`unexpected path in test: ${path}`)
    const limit = params['limit'] === undefined ? defaultFor(path) : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > maxFor(path))
      throw Object.assign(new Error(`400 limit ${String(params['limit'])}`), {
        response: { status: 400 },
      })
    let start = 0
    const cursor = params['cursor']
    if (cursor !== undefined) {
      const m = /^([^|]+)\|(.+)\|(\d+)$/.exec(Buffer.from(String(cursor), 'base64').toString())
      if (!m || m[1] !== account || m[2] !== path)
        throw Object.assign(new Error('400 bad cursor'), { response: { status: 400 } })
      start = Number(m[3])
    }
    const withVariants = params['with'] === 'variants'
    const entities = rows.slice(start, start + limit).map((r) => {
      if (withVariants) return r
      const { variants: _v, ...rest } = r
      return rest
    })
    const next = start + limit < rows.length ? cursorFor(path, start + limit, account) : null
    return { data: { entities, cursor: { next } } }
  })
  return { get, calls }
}

function fake(data: Partial<Record<string, Raw[]>>) {
  const server = makeServer(data)
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get, defaults: {} } as never)
  return server
}

const pad = (i: number): string => String(i + 1).padStart(4, '0')

/** `n` variants spread over products of 1 and 2 variants, in order. */
function productsWithVariants(n: number, prefix = 'var'): { products: Raw[]; ids: string[] } {
  const out: Raw[] = []
  const ids: string[] = []
  let v = 0
  for (let i = 0; v < n; i++) {
    const count = Math.min((i % 2) + 1, n - v)
    const variants = Array.from({ length: count }, () => {
      const id = `${prefix}-${pad(v++)}`
      ids.push(id)
      return { id, referenceKey: id }
    })
    out.push({ id: `prod-${pad(i)}`, variants })
  }
  return { products: out, ids }
}

type Method =
  | 'listProducts'
  | 'listVariants'
  | 'listCollections'
  | 'listLocations'
  | 'listCustomers'
  | 'listOrders'
  | 'listDiscounts'

interface Case {
  name: string
  method: Method
  path: string
  extra?: Record<string, unknown>
  build: (n: number) => { data: Partial<Record<string, Raw[]>>; ids: string[] }
  kind: 'cursor' | 'rows'
}

const simple = (path: string, prefix: string) => (n: number) => {
  const ids = Array.from({ length: n }, (_, i) => `${prefix}-${pad(i)}`)
  return { data: { [path]: ids.map((id) => ({ id })) }, ids }
}

const CASES: Case[] = [
  {
    name: 'listProducts',
    method: 'listProducts',
    path: '/products',
    kind: 'cursor',
    build: simple('/products', 'prod'),
  },
  {
    name: 'listVariants (productId)',
    method: 'listVariants',
    path: '/products/p-1/variants',
    extra: { productId: 'p-1' },
    kind: 'cursor',
    build: simple('/products/p-1/variants', 'var'),
  },
  {
    name: 'listVariants (flattened)',
    method: 'listVariants',
    path: '/products',
    kind: 'rows',
    build: (n) => {
      const { products, ids } = productsWithVariants(n)
      return { data: { '/products': products }, ids }
    },
  },
  {
    name: 'listCollections',
    method: 'listCollections',
    path: '/shops/shop-1/categories',
    kind: 'cursor',
    build: simple('/shops/shop-1/categories', 'cat'),
  },
  {
    name: 'listLocations',
    method: 'listLocations',
    path: '/warehouses',
    kind: 'cursor',
    build: simple('/warehouses', 'wh'),
  },
  {
    name: 'listCustomers',
    method: 'listCustomers',
    path: '/shops/shop-1/countries/DE/customers',
    kind: 'cursor',
    build: simple('/shops/shop-1/countries/DE/customers', 'cus'),
  },
  {
    name: 'listOrders',
    method: 'listOrders',
    path: ORDERS,
    kind: 'cursor',
    build: simple(ORDERS, 'ord'),
  },
  {
    name: 'listDiscounts',
    method: 'listDiscounts',
    path: '/promotions',
    kind: 'cursor',
    build: simple('/promotions', 'promo'),
  },
]

async function list(
  adapter: ScayleAdapter,
  method: Method,
  params: QueryParams,
  creds: Credentials = CREDS,
): Promise<string[]> {
  const rows = (await adapter[method](creds, params)) as { id: string }[]
  return rows.map((r) => r.id)
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe('SCAYLE list paging', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      const max = maxFor(c.path)
      const q = (p: Record<string, unknown>) => withPageSink({ ...c.extra, ...p } as QueryParams)
      // L = 140 (281 variants over 188 products) makes the flattened variants cross upstream pages of 100 products.
      const sizes = c.kind === 'rows' ? [3, 140] : [3, 17]

      it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
        for (const L of sizes) {
          _resetCursorPager()
          vi.restoreAllMocks()
          const { data, ids } = c.build(2 * L + 1)
          fake(data)
          const a = new ScayleAdapter()
          const seen: string[] = []
          const hasMore: (boolean | undefined)[] = []
          for (const page of [1, 2, 3]) {
            const params = q({ page, limit: L })
            seen.push(...(await list(a, c.method, params)))
            hasMore.push(readUpstreamPage(params)?.hasMore)
          }
          expect(seen).toEqual(ids)
          expect(hasMore).toEqual([true, true, false])
        }
      })

      it('the page-2 request carries the documented cursor and limit', async () => {
        const L = c.kind === 'rows' ? 140 : 7
        const { data, ids } = c.build(2 * L + 1)
        const { calls } = fake(data)
        expect(await list(new ScayleAdapter(), c.method, q({ page: 2, limit: L }))).toEqual(
          ids.slice(L, 2 * L),
        )
        expect(calls[0]!.params['cursor']).toBeUndefined()
        const sent = c.kind === 'rows' ? 100 : L
        expect(calls.every((x) => x.path === c.path && x.params['limit'] === sent)).toBe(true)
        expect(calls.some((x) => x.params['cursor'] === cursorFor(c.path, sent))).toBe(true)
        if (c.kind === 'rows')
          expect(calls.every((x) => x.params['with'] === 'variants')).toBe(true)
      })

      it(`clamps a limit above ${max} and still serves every row`, async () => {
        const over = max * 5
        const { data, ids } = c.build(2 * max + 1)
        const { calls } = fake(data)
        const a = new ScayleAdapter()
        const seen: string[] = []
        for (let page = 1; ; page++) {
          expect(page).toBeLessThan(12)
          const params = q({ page, limit: over })
          const got = await list(a, c.method, params)
          seen.push(...got)
          const meta = readUpstreamPage(params)
          if (c.kind === 'cursor') expect(meta?.pageSize).toBe(max)
          if (!meta?.hasMore) break
        }
        expect(seen).toEqual(ids)
        for (const x of calls) expect(x.params['limit']).toBeLessThanOrEqual(max)
      })

      it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
        const { data, ids } = c.build(25)
        fake(data)
        const a = new ScayleAdapter()
        const p1 = Object.assign(parseListQuery({ limit: '10', page: '1' }, routed(a)), c.extra)
        const r1 = listPage((await a[c.method](CREDS, p1)) as { id: string }[], p1, 'scayle')
        expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
        expect(r1.meta.hasMore).toBe(true)

        const p3 = Object.assign(parseListQuery({ limit: '10', page: '3' }, routed(a)), c.extra)
        const r3 = listPage((await a[c.method](CREDS, p3)) as { id: string }[], p3, 'scayle')
        expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
        expect(r3.meta.hasMore).toBe(false)
      })
    })
  }

  it('an explicit upstream cursor is forwarded as one page', async () => {
    const { data, ids } = CASES[0]!.build(30)
    const { calls } = fake(data)
    const params = withPageSink({ limit: 10, cursor: cursorFor('/products', 10) } as QueryParams)
    expect(await list(new ScayleAdapter(), 'listProducts', params)).toEqual(ids.slice(10, 20))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params['cursor']).toBe(cursorFor('/products', 10))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  /**
   * Routes axios.create to a fake account by token and tenant. Each account's
   * server mints its own cursors and rejects any other account's, as SCAYLE's
   * opaque cursors would.
   */
  function accounts(servers: Record<string, ReturnType<typeof makeServer>>) {
    vi.spyOn(axios, 'create').mockImplementation(((config?: {
      baseURL?: string
      headers?: Record<string, string>
    }) => {
      const token = config?.headers?.['X-Access-Token'] ?? ''
      const tenant = /acme-live|beta-live/.exec(config?.baseURL ?? '')?.[0] ?? ''
      const server = servers[`${tenant}/${token}`]
      if (!server) throw new Error(`no fake account for ${tenant}/${token}`)
      return { get: server.get, defaults: {} }
    }) as never)
  }
  const creds = (tenantSpace: string, accessToken: string): Credentials => ({
    accessToken,
    extra: { ...CREDS.extra, tenantSpace },
  })
  const page = (p: number, limit: number, extra: Record<string, unknown> = {}) =>
    withPageSink({ page: p, limit, ...extra } as QueryParams)

  it('two connections (tokens) never share a walk', async () => {
    accounts({
      'acme-live/key-a': makeServer(simple('/products', 'a')(15).data, 'a'),
      'acme-live/key-b': makeServer(simple('/products', 'b')(15).data, 'b'),
    })
    const adapter = new ScayleAdapter()
    await list(adapter, 'listProducts', page(1, 5), creds('acme-live', 'key-a'))
    expect(await list(adapter, 'listProducts', page(2, 5), creds('acme-live', 'key-b'))).toEqual([
      'b-0006',
      'b-0007',
      'b-0008',
      'b-0009',
      'b-0010',
    ])
  })

  it('two tenants with the same key never share a walk', async () => {
    accounts({
      'acme-live/same-key': makeServer(simple('/products', 'a')(15).data, 'a'),
      'beta-live/same-key': makeServer(simple('/products', 'b')(15).data, 'b'),
    })
    const adapter = new ScayleAdapter()
    await list(adapter, 'listProducts', page(1, 5), creds('acme-live', 'same-key'))
    expect(await list(adapter, 'listProducts', page(2, 5), creds('beta-live', 'same-key'))).toEqual(
      ['b-0006', 'b-0007', 'b-0008', 'b-0009', 'b-0010'],
    )
  })

  it('flattened variants: two connections never share a walk or its rows', async () => {
    const a = productsWithVariants(15, 'a')
    const b = productsWithVariants(15, 'b')
    accounts({
      'acme-live/key-a': makeServer({ '/products': a.products }, 'a'),
      'acme-live/key-b': makeServer({ '/products': b.products }, 'b'),
    })
    const adapter = new ScayleAdapter()
    expect(await list(adapter, 'listVariants', page(1, 5), creds('acme-live', 'key-a'))).toEqual(
      a.ids.slice(0, 5),
    )
    expect(await list(adapter, 'listVariants', page(2, 5), creds('acme-live', 'key-b'))).toEqual(
      b.ids.slice(5, 10),
    )
  })

  it('one collection walked at two page sizes on one connection never shares a walk', async () => {
    const { data, ids } = simple('/products', 'prod')(40)
    fake(data)
    const a = new ScayleAdapter()
    expect(await list(a, 'listProducts', page(1, 5))).toEqual(ids.slice(0, 5))
    expect(await list(a, 'listProducts', page(2, 10))).toEqual(ids.slice(10, 20))
  })

  it('an explicit cursor at the last page reports no more', async () => {
    const { data, ids } = CASES[0]!.build(30)
    fake(data)
    const params = withPageSink({ limit: 10, cursor: cursorFor('/products', 20) } as QueryParams)
    expect(await list(new ScayleAdapter(), 'listProducts', params)).toEqual(ids.slice(20))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('flattened variants: an explicit cursor is one upstream page at the caller size', async () => {
    const { products } = productsWithVariants(30)
    const { calls } = fake({ '/products': products })
    // 30 variants sit in 20 products; the cursor limit counts products, so the caller's 7 means products 8..14.
    const mid = withPageSink({ limit: 7, cursor: cursorFor('/products', 7) } as QueryParams)
    const got = await list(new ScayleAdapter(), 'listVariants', mid)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toMatchObject({
      limit: 7,
      with: 'variants',
      cursor: cursorFor('/products', 7),
    })
    const expected = products
      .slice(7, 14)
      .flatMap((p) => (p['variants'] as { id: string }[]).map((v) => v.id))
    expect(got).toEqual(expected)
    expect(readUpstreamPage(mid)?.hasMore).toBe(true)

    const last = withPageSink({ limit: 7, cursor: cursorFor('/products', 14) } as QueryParams)
    await list(new ScayleAdapter(), 'listVariants', last)
    expect(readUpstreamPage(last)?.hasMore).toBe(false)

    const over = withPageSink({ limit: 5000, cursor: cursorFor('/products', 0) } as QueryParams)
    await list(new ScayleAdapter(), 'listVariants', over)
    expect(calls.at(-1)!.params['limit']).toBe(100)
  })

  it('with no limit, every list sends the default page size of 100', async () => {
    for (const c of CASES) {
      vi.restoreAllMocks()
      _resetCursorPager()
      const { data } = c.build(5)
      const { calls } = fake(data)
      await list(
        new ScayleAdapter(),
        c.method,
        withPageSink({ page: 1, ...c.extra } as QueryParams),
      )
      expect(calls[0]!.params['limit'], c.name).toBe(100)
    }
  })

  it('variants of two products never share a walk', async () => {
    fake({
      ...simple('/products/p-1/variants', 'x')(15).data,
      ...simple('/products/p-2/variants', 'y')(15).data,
    })
    const a = new ScayleAdapter()
    await list(
      a,
      'listVariants',
      withPageSink({ page: 1, limit: 5, productId: 'p-1' } as QueryParams),
    )
    expect(
      await list(
        a,
        'listVariants',
        withPageSink({ page: 2, limit: 5, productId: 'p-2' } as QueryParams),
      ),
    ).toEqual(['y-0006', 'y-0007', 'y-0008', 'y-0009', 'y-0010'])
  })
})
