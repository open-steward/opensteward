/**
 * FaireAdapter against a fake of the documented External API v2
 * (https://developers.faire.com/docs; spec in
 * https://cdn.faire.com/static/js/784.fd6421f2.chunk.js).
 *
 * The fake honours only documented parameters: GET /products takes `limit`
 * (10-250), `cursor`, `updated_at_min` (plus page/sku/include_deleted, which
 * the adapter never sends); GET /orders takes `limit` (10-50), `cursor`,
 * `updated_at_min`. Filters must not accompany a cursor ("When cursor is
 * passed, updated_at_min, sku, and include_deleted must not be passed"), and
 * the last page carries no `cursor`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { FaireAdapter } from '../../../../../../src/verticals/ecommerce/adapters/faire/index'
import type { RawFaireProduct } from '../../../../../../src/verticals/ecommerce/adapters/faire/transform/product'
import type { RawFaireOrder } from '../../../../../../src/verticals/ecommerce/adapters/faire/transform/order'
import { OrderSchema } from '../../../../../../src/verticals/ecommerce/schema/order'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../src/verticals/ecommerce/schema/product'
import { InventoryLevelSchema } from '../../../../../../src/verticals/ecommerce/schema/inventory'
import { docOrder, docProduct, docVariant } from './fixtures'

const CFG = {
  clientId: 'app_123',
  clientSecret: 'secret_456',
  redirectUri: 'https://example.com/callback',
}
const CREDS = { accessToken: 'oauth_tok' }

interface Call {
  path: string
  params: Record<string, unknown>
}

const LIMITS: Record<string, [number, number]> = { '/products': [10, 250], '/orders': [10, 50] }
const FILTERS: Record<string, string[]> = {
  '/products': ['updated_at_min', 'sku', 'include_deleted'],
  '/orders': ['updated_at_min', 'created_at_min', 'excluded_states', 'ship_after_max'],
}
const DOCUMENTED: Record<string, string[]> = {
  '/products': ['limit', 'page', 'cursor', ...FILTERS['/products']!],
  '/orders': ['limit', 'page', 'cursor', 'sort_by', 'original_order_id', ...FILTERS['/orders']!],
}

/** A cursor-paged collection, served as the docs describe. */
function fakeFaire(
  rows: { '/products'?: RawFaireProduct[]; '/orders'?: RawFaireOrder[] },
  singles: Record<string, unknown> = {},
) {
  const calls: Call[] = []
  const created: Record<string, unknown>[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = { ...(cfg?.params ?? {}) }
    calls.push({ path, params })
    if (path in singles) return { data: singles[path], headers: {} }
    const list = rows[path as '/products' | '/orders']
    if (!list) throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
    for (const k of Object.keys(params)) {
      if (!DOCUMENTED[path]!.includes(k)) throw new Error(`undocumented param ${k} on ${path}`)
    }
    const limit = Number(params.limit ?? 50)
    const [min, max] = LIMITS[path]!
    if (limit < min || limit > max) throw new Error(`400 limit ${limit} outside ${min}-${max}`)
    let start = 0
    // The cursor carries the first request's filter, as an opaque cursor would.
    let since = params.updated_at_min as string | undefined
    if (params.cursor !== undefined) {
      for (const f of FILTERS[path]!) {
        if (params[f] !== undefined) throw new Error(`400 ${f} passed with cursor`)
      }
      const [offset, filter] = String(params.cursor).slice('cur_'.length).split('|')
      start = Number(offset)
      since = filter || undefined
    }
    let source: { id: string; updated_at?: string }[] = list
    if (typeof since === 'string') source = list.filter((r) => (r.updated_at ?? '') >= since)
    const page = source.slice(start, start + limit)
    const end = start + limit
    const key = path === '/products' ? 'products' : 'orders'
    const body: Record<string, unknown> = { [key]: page, page: 1, limit }
    if (end < source.length) body.cursor = `cur_${end}${since ? `|${since}` : ''}`
    return { data: body, headers: {} }
  })
  const post = vi.fn()
  const spy = vi.spyOn(axios, 'create').mockImplementation(((c: Record<string, unknown>) => {
    created.push(c)
    return { get, post, patch: vi.fn(), delete: vi.fn() }
  }) as never)
  return { calls, created, get, spy }
}

function products(n: number, variantsPer: (i: number) => number = () => 1): RawFaireProduct[] {
  return Array.from({ length: n }, (_, i) => {
    const id = `p_${String(i).padStart(3, '0')}`
    return docProduct({
      id,
      updated_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      variants: Array.from({ length: variantsPer(i) }, (_, j) =>
        docVariant({
          id: `po_${i}_${j}`,
          product_id: id,
          available_quantity: j % 2 === 0 ? 5 : undefined,
        }),
      ),
    })
  })
}

function orders(n: number): RawFaireOrder[] {
  return Array.from({ length: n }, (_, i) => docOrder({ id: `bo_${String(i).padStart(3, '0')}` }))
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

async function walk<T extends { id: string }>(
  list: (params: QueryParams) => Promise<T[]>,
  limit: number,
  pages: number,
  extra: Partial<QueryParams> = {},
) {
  const seen: string[] = []
  const hasMore: boolean[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ ...extra, page, limit })
    const rows = await list(params)
    expect(rows.length).toBeLessThanOrEqual(limit)
    seen.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore ?? false)
  }
  return { seen, hasMore }
}

describe('auth and host', () => {
  it('sends both documented headers to the /external-api/v2 base', async () => {
    const { created, calls } = fakeFaire({ '/products': products(1) })
    await new FaireAdapter(CFG).listProducts(CREDS, { page: 1, limit: 10 })
    expect(created[0]!.baseURL).toBe('https://www.faire.com/external-api/v2')
    const headers = created[0]!.headers as Record<string, string>
    expect(headers['X-FAIRE-OAUTH-ACCESS-TOKEN']).toBe('oauth_tok')
    expect(headers['X-FAIRE-APP-CREDENTIALS']).toBe(
      Buffer.from('app_123:secret_456').toString('base64'),
    )
    expect(headers['X-FAIRE-ACCESS-TOKEN']).toBeUndefined()
    expect(calls[0]!.path).toBe('/products')
  })

  it('refuses to send a request without the application credentials', async () => {
    const { calls } = fakeFaire({ '/products': products(1) })
    await expect(
      new FaireAdapter({ ...CFG, clientSecret: '' }).listProducts(CREDS, { page: 1, limit: 10 }),
    ).rejects.toThrow(/X-FAIRE-APP-CREDENTIALS/)
    expect(calls).toHaveLength(0)
  })

  it('builds the documented OAuth permission URL', () => {
    const url = new URL(
      new FaireAdapter({ ...CFG, scopes: ['READ_PRODUCTS', 'READ_ORDERS'] }).getAuthUrl('st8'),
    )
    expect(url.origin + url.pathname).toBe('https://faire.com/oauth2/authorize')
    expect(url.searchParams.get('applicationId')).toBe('app_123')
    expect(url.searchParams.getAll('scope')).toEqual(['READ_PRODUCTS', 'READ_ORDERS'])
    expect(url.searchParams.get('state')).toBe('st8')
    expect(url.searchParams.get('redirectUrl')).toBe('https://example.com/callback')
  })

  it('exchanges the code at the documented token endpoint with the documented body', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'OAUTH_ACCESS_TOKEN', token_type: 'BEARER' } })
    const creds = await new FaireAdapter({ ...CFG, scopes: ['READ_PRODUCTS'] }).exchangeCode(
      'code_1',
      'ignored',
    )
    expect(creds).toEqual({ accessToken: 'OAUTH_ACCESS_TOKEN' })
    expect(post).toHaveBeenCalledWith(
      'https://www.faire.com/api/external-api-oauth2/token',
      {
        application_token: 'app_123',
        application_secret: 'secret_456',
        redirect_url: 'https://example.com/callback',
        scope: ['READ_PRODUCTS'],
        grant_type: 'AUTHORIZATION_CODE',
        authorization_code: 'code_1',
      },
      expect.anything(),
    )
  })

  it('honours a per-link scope override at authorize, and without one the exchange repeats the authorize scopes', async () => {
    // A read-only link's curated scopes replace the configured set, so it never asks
    // for more than its policy allows. Without an override, both legs send the
    // configured set: the token request's `scope` "must match the previously
    // provided scope parameter".
    const adapter = new FaireAdapter({ ...CFG, scopes: ['READ_PRODUCTS', 'WRITE_PRODUCTS'] })
    const overridden = new URL(adapter.getAuthUrl('st8', ['READ_PRODUCTS']))
    expect(overridden.searchParams.getAll('scope')).toEqual(['READ_PRODUCTS'])
    const url = new URL(adapter.getAuthUrl('st8'))
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok', token_type: 'BEARER' } })
    await adapter.exchangeCodeWithScopes('code_1', 'ignored', undefined)
    await adapter.exchangeCode('code_2', 'ignored')
    expect(url.searchParams.getAll('scope')).toEqual(['READ_PRODUCTS', 'WRITE_PRODUCTS'])
    expect(post).toHaveBeenCalledTimes(2)
    for (const call of post.mock.calls) {
      expect((call[1] as { scope: string[] }).scope).toEqual(url.searchParams.getAll('scope'))
    }
  })

  it('treats an empty override as no override on both legs', async () => {
    // A 'custom' link with no scopes resolves to []. An empty scope list would
    // ask for nothing; both legs fall back to the configured set and stay equal,
    // as the token request requires.
    const adapter = new FaireAdapter({ ...CFG, scopes: ['READ_PRODUCTS', 'WRITE_PRODUCTS'] })
    const url = new URL(adapter.getAuthUrl('st8', []))
    expect(url.searchParams.getAll('scope')).toEqual(['READ_PRODUCTS', 'WRITE_PRODUCTS'])
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok', token_type: 'BEARER' } })
    await adapter.exchangeCodeWithScopes('code_1', 'ignored', [])
    expect(post).toHaveBeenCalledTimes(1)
    expect((post.mock.calls[0]![1] as { scope: string[] }).scope).toEqual([
      'READ_PRODUCTS',
      'WRITE_PRODUCTS',
    ])
  })

  it("repeats an overridden link's authorize scopes at the exchange", async () => {
    // The control plane replays the override getAuthUrl was handed; the exchange
    // body must carry exactly that list, not the configured set.
    const adapter = new FaireAdapter({ ...CFG, scopes: ['READ_PRODUCTS', 'WRITE_PRODUCTS'] })
    const override = ['READ_PRODUCTS', 'READ_ORDERS']
    const url = new URL(adapter.getAuthUrl('st8', override))
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok', token_type: 'BEARER' } })
    await adapter.exchangeCodeWithScopes('code_1', 'ignored', override)
    const body = post.mock.calls[0]![1] as { scope: string[] }
    expect(body.scope).toEqual(['READ_PRODUCTS', 'READ_ORDERS'])
    expect(body.scope).toEqual(url.searchParams.getAll('scope'))
  })

  it('has no refresh grant to call: credentials come back unchanged, with no request', async () => {
    const post = vi.spyOn(axios, 'post')
    const c = { accessToken: 'a', refreshToken: 'r' }
    expect(await new FaireAdapter(CFG).refreshCredentials(c)).toBe(c)
    expect(post).not.toHaveBeenCalled()
  })
})

describe('listProducts', () => {
  it('walks N = 2L+1 products by cursor: every id once, hasMore exact, filters only on page 1', async () => {
    const L = 10
    const all = products(2 * L + 1)
    const { calls } = fakeFaire({ '/products': all })
    const adapter = new FaireAdapter(CFG)
    const { seen, hasMore } = await walk((p) => adapter.listProducts(CREDS, p), L, 3)
    expect(seen).toEqual(all.map((p) => p.id))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params)).toEqual([
      { limit: 10 },
      { limit: 10, cursor: 'cur_10' },
      { limit: 10, cursor: 'cur_20' },
    ])
  })

  it('sends updated_at_min on the first request only, and walks the filtered set', async () => {
    const all = products(28)
    const { calls } = fakeFaire({ '/products': all })
    const adapter = new FaireAdapter(CFG)
    const since = new Date('2026-01-05T00:00:00.000Z')
    const { seen, hasMore } = await walk((p) => adapter.listProducts(CREDS, p), 10, 3, {
      updatedAfter: since,
    })
    expect(seen).toEqual(all.slice(4).map((p) => p.id))
    expect(hasMore).toEqual([true, true, false])
    expect(calls[0]!.params).toEqual({ limit: 10, updated_at_min: '2026-01-05T00:00:00.000Z' })
    expect(calls[1]!.params).toEqual({ limit: 10, cursor: 'cur_10|2026-01-05T00:00:00.000Z' })
  })

  it('keys the walk by its filter: an unfiltered page 2 never follows a filtered cursor', async () => {
    const all = products(28)
    const { calls } = fakeFaire({ '/products': all })
    const adapter = new FaireAdapter(CFG)
    const since = new Date('2026-01-05T00:00:00.000Z')
    await walk((p) => adapter.listProducts(CREDS, p), 10, 2, { updatedAfter: since })
    const before = calls.length
    const rows = await adapter.listProducts(CREDS, withPageSink({ page: 2, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(all.slice(10, 20).map((p) => p.id))
    // A fresh, unfiltered walk from the first page (the last call peeks for hasMore).
    expect(calls.slice(before, before + 2).map((c) => c.params)).toEqual([
      { limit: 10 },
      { limit: 10, cursor: 'cur_10' },
    ])
  })

  it('clamps to the documented 10-250: a 5-row page is cut from a 10-row upstream page', async () => {
    const all = products(12)
    const { calls } = fakeFaire({ '/products': all })
    const adapter = new FaireAdapter(CFG)
    const { seen, hasMore } = await walk((p) => adapter.listProducts(CREDS, p), 5, 3)
    expect(seen).toEqual(all.map((p) => p.id))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.every((c) => c.params.limit === 10)).toBe(true)
  })

  it('a 500-row page is served from 250-row upstream pages', async () => {
    const all = products(600)
    const { calls } = fakeFaire({ '/products': all })
    const adapter = new FaireAdapter(CFG)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await adapter.listProducts(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all.slice(0, 500).map((p) => p.id))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(calls.every((c) => c.params.limit === 250)).toBe(true)
  })

  it('every product parses as a canonical Product', async () => {
    fakeFaire({ '/products': products(3) })
    const rows = await new FaireAdapter(CFG).listProducts(CREDS, { page: 1, limit: 10 })
    for (const r of rows) ProductSchema.parse(r)
  })
})

describe('getProduct', () => {
  it('reads the unwrapped ExternalProductV2 from GET /products/{product_id}', async () => {
    const { calls } = fakeFaire({}, { '/products/p_123': docProduct() })
    const p = ProductSchema.parse(await new FaireAdapter(CFG).getProduct(CREDS, 'p_123'))
    expect(p.id).toBe('p_123')
    expect(calls.map((c) => c.path)).toEqual(['/products/p_123'])
  })
})

describe('listVariants', () => {
  it('flattens product.variants over the product cursor with uneven pages: every id once, hasMore exact', async () => {
    // 0-3 variants per product, so upstream pages hold uneven variant counts.
    const all = products(30, (i) => i % 4)
    const expected = all.flatMap((p) => (p.variants ?? []).map((v) => `${p.id}:${v.id}`))
    const L = 10
    expect(expected.length).toBeGreaterThan(2 * L)
    const { calls } = fakeFaire({ '/products': all })
    const adapter = new FaireAdapter(CFG)
    const pages = Math.ceil(expected.length / L)
    const { seen, hasMore } = await walk((p) => adapter.listVariants(CREDS, p), L, pages + 1)
    expect(seen).toEqual(expected)
    expect(hasMore).toEqual([...Array(pages - 1).fill(true), false, false])
    expect(calls.every((c) => c.path === '/products')).toBe(true)
    expect(calls.filter((c) => c.params.cursor === undefined).length).toBeGreaterThanOrEqual(1)
  })

  it('keys the walk by collection: a variants page never reuses the products walk', async () => {
    // Two variants per product, so the variant stream is twice the product stream.
    const all = products(30, () => 2)
    fakeFaire({ '/products': all })
    const adapter = new FaireAdapter(CFG)
    await walk((p) => adapter.listProducts(CREDS, p), 10, 2)
    const rows = await adapter.listVariants(CREDS, withPageSink({ page: 2, limit: 10 }))
    const expected = all.flatMap((p) => (p.variants ?? []).map((v) => `${p.id}:${v.id}`))
    expect(rows.map((r) => r.id)).toEqual(expected.slice(10, 20))
  })

  it('every id listVariants returns reads back through getVariant', async () => {
    const all = products(3, () => 2)
    const singles = Object.fromEntries(all.map((p) => [`/products/${p.id}`, p]))
    fakeFaire({ '/products': all }, singles)
    const adapter = new FaireAdapter(CFG)
    const listed = await adapter.listVariants(CREDS, { page: 1, limit: 10 })
    expect(listed).toHaveLength(6)
    for (const v of listed) expect((await adapter.getVariant(CREDS, v.id)).id).toBe(v.id)
  })

  it('walks exactly 2L+1 variants', async () => {
    const all = products(21)
    fakeFaire({ '/products': all })
    const adapter = new FaireAdapter(CFG)
    const { seen, hasMore } = await walk((p) => adapter.listVariants(CREDS, p), 10, 3)
    expect(seen).toEqual(all.map((p) => `${p.id}:${p.variants![0]!.id}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it("with a product filter, pages that product's variants from GET /products/{product_id}", async () => {
    const product = docProduct({
      variants: [
        docVariant({ id: 'po_a' }),
        docVariant({ id: 'po_b' }),
        docVariant({ id: 'po_c' }),
      ],
    })
    const { calls } = fakeFaire({}, { '/products/p_123': product })
    const params = withPageSink({ page: 2, limit: 2, productId: 'p_123' })
    const rows = await new FaireAdapter(CFG).listVariants(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['p_123:po_c'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls.map((c) => c.path)).toEqual(['/products/p_123'])
    for (const r of rows) ProductVariantSchema.parse(r)
  })
})

describe('getVariant', () => {
  it('reads the variant from its product, by productId:variantId', async () => {
    fakeFaire(
      {},
      {
        '/products/p_123': docProduct({
          variants: [docVariant({ id: 'po_a' }), docVariant({ id: 'po_123' })],
        }),
      },
    )
    const v = ProductVariantSchema.parse(
      await new FaireAdapter(CFG).getVariant(CREDS, 'p_123:po_123'),
    )
    expect(v.id).toBe('p_123:po_123')
    expect(v.productId).toBe('p_123')
    expect(v.sku).toBe((v.metadata as { sku?: string }).sku)
    expect((v.metadata as { id: string }).id).toBe('po_123')
  })

  it('refuses a bare id before sending anything', async () => {
    const { calls } = fakeFaire({})
    await expect(new FaireAdapter(CFG).getVariant(CREDS, 'po_123')).rejects.toThrow(/composite id/)
    expect(calls).toHaveLength(0)
  })
})

describe('listInventoryLevels', () => {
  it('flattens variants with available_quantity over the product cursor: every level once, hasMore exact', async () => {
    // Variants j = 0, 2 carry available_quantity; j = 1, 3 do not.
    const all = products(40, (i) => (i % 5) + 1)
    const expected = all.flatMap((p) =>
      (p.variants ?? [])
        .filter((v) => v.available_quantity != null)
        .map((v) => `${p.id}:${v.id}:faire:default`),
    )
    const L = 10
    const pages = Math.ceil(expected.length / L)
    fakeFaire({ '/products': all })
    const adapter = new FaireAdapter(CFG)
    const { seen, hasMore } = await walk((p) => adapter.listInventoryLevels(CREDS, p), L, pages)
    expect(seen).toEqual(expected)
    expect(hasMore).toEqual([...Array(pages - 1).fill(true), false])
  })

  it('levels parse as canonical InventoryLevels and never invent a 0', async () => {
    fakeFaire({ '/products': products(3, () => 2) })
    const rows = await new FaireAdapter(CFG).listInventoryLevels(CREDS, { page: 1, limit: 10 })
    // The canonical ProductVariant.id: productId:variantId.
    expect(rows.map((r) => r.variantId)).toEqual(['p_000:po_0_0', 'p_001:po_1_0', 'p_002:po_2_0'])
    for (const r of rows) InventoryLevelSchema.parse(r)
  })
})

describe('listInventoryLevels with a product filter', () => {
  it("pages that product's levels from GET /products/{product_id}", async () => {
    const product = docProduct({
      variants: [
        docVariant({ id: 'po_a', available_quantity: 1 }),
        docVariant({ id: 'po_b' }),
        docVariant({ id: 'po_c', available_quantity: 3 }),
        docVariant({ id: 'po_d', available_quantity: 4 }),
      ],
    })
    const { calls } = fakeFaire({}, { '/products/p_123': product })
    const params = withPageSink({ page: 2, limit: 2, productId: 'p_123' })
    const rows = await new FaireAdapter(CFG).listInventoryLevels(CREDS, params)
    expect(rows.map((r) => r.variantId)).toEqual(['p_123:po_d'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls.map((c) => c.path)).toEqual(['/products/p_123'])
    for (const r of rows) InventoryLevelSchema.parse(r)
  })
})

describe('listOrders', () => {
  it('walks N = 2L+1 orders by cursor: every id once, hasMore exact', async () => {
    const all = orders(21)
    const { calls } = fakeFaire({ '/orders': all })
    const adapter = new FaireAdapter(CFG)
    const { seen, hasMore } = await walk((p) => adapter.listOrders(CREDS, p), 10, 3)
    expect(seen).toEqual(all.map((o) => o.id))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params)).toEqual([
      { limit: 10 },
      { limit: 10, cursor: 'cur_10' },
      { limit: 10, cursor: 'cur_20' },
    ])
  })

  it('clamps the upstream page to the documented maximum of 50', async () => {
    const all = orders(120)
    const { calls } = fakeFaire({ '/orders': all })
    const params = withPageSink({ page: 1, limit: 100 })
    const rows = await new FaireAdapter(CFG).listOrders(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all.slice(0, 100).map((o) => o.id))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(calls.every((c) => c.params.limit === 50)).toBe(true)
  })

  it('sends updated_at_min on the first request only', async () => {
    const { calls } = fakeFaire({ '/orders': orders(15) })
    const adapter = new FaireAdapter(CFG)
    const since = new Date('2019-01-01T00:00:00.000Z')
    await walk((p) => adapter.listOrders(CREDS, p), 10, 2, { updatedAfter: since })
    expect(calls[0]!.params).toEqual({ limit: 10, updated_at_min: '2019-01-01T00:00:00.000Z' })
    expect(calls[1]!.params).toEqual({ limit: 10, cursor: 'cur_10|2019-01-01T00:00:00.000Z' })
  })

  it('orders parse as canonical Orders', async () => {
    fakeFaire({ '/orders': orders(2) })
    const rows = await new FaireAdapter(CFG).listOrders(CREDS, { page: 1, limit: 10 })
    for (const r of rows) OrderSchema.parse(r)
  })
})

describe('getOrder', () => {
  it('reads the unwrapped ExternalOrderV2 from GET /orders/{order_id}', async () => {
    const { calls } = fakeFaire({}, { '/orders/bo_bxdmjbwxid': docOrder() })
    const o = OrderSchema.parse(await new FaireAdapter(CFG).getOrder(CREDS, 'bo_bxdmjbwxid'))
    expect(o.id).toBe('bo_bxdmjbwxid')
    expect(calls.map((c) => c.path)).toEqual(['/orders/bo_bxdmjbwxid'])
  })
})
