/**
 * JOOR listProducts / listCollections paging contract.
 *
 * Neither `GET /v4/products` nor `GET /v4/collections` documents a paging
 * parameter (https://api-docs.jooraccess.com/reference/get-products.md,
 * https://api-docs.jooraccess.com/reference/get-collections.md): the
 * parameter lists are filters only, with no page / page_size / limit /
 * offset / cursor, and the response carries no paging metadata. Get Orders
 * on the same site does document page/page_size, so the omission is real.
 * One call returns the whole collection, so the adapter must window it
 * locally (pageLocally) and serve each row once at the caller's page size.
 *
 * listProducts then looks SKUs up by `product_ids` for that page's products
 * only, not for every product in the account.
 *
 * The fake upstream below honours only what the docs describe: products and
 * collections ignore every query parameter except `account`, and skus
 * honours its documented `product_ids` filter.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  MAX_PAGE_LIMIT,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { JoorAdapter } from '../../../../../../src/verticals/ecommerce/adapters/joor/index'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const CREDS = { accessToken: 'tok', extra: { accountId: 'acct-1', sandbox: true } }

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

function fakeJoor(count: number): { calls: Call[]; ids: string[] } {
  const ids = Array.from({ length: count }, (_, i) => `id-${String(i).padStart(5, '0')}`)
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params
    calls.push({ path, params })
    if (path === 'products') {
      return { data: { data: ids.map((id) => ({ id, name: `Product ${id}` })) } }
    }
    if (path === 'collections') {
      return { data: { data: ids.map((id) => ({ id, name: `Collection ${id}` })) } }
    }
    if (path === 'skus') {
      const wanted = String(params?.['product_ids'] ?? '')
        .split(',')
        .filter(Boolean)
      return {
        data: {
          data: wanted.map((pid) => ({
            id: `sku-${pid}`,
            product_id: pid,
            trait_values: [{ trait: { id: '3', name: 'Color' }, value: `navy-${pid}` }],
          })),
        },
      }
    }
    throw new Error(`unexpected path in test: ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
  return { calls, ids }
}

afterEach(() => {
  vi.restoreAllMocks()
})

type Lister = (a: JoorAdapter, p: QueryParams) => Promise<Array<{ id: string }>>
const METHODS: Array<[string, string, Lister]> = [
  ['listProducts', 'products', (a, p) => a.listProducts(CREDS, p)],
  ['listCollections', 'collections', (a, p) => a.listCollections(CREDS, p)],
]

describe.each(METHODS)('JOOR %s paging', (name, path, list) => {
  it(`${name}: serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore`, async () => {
    const L = 4
    const { ids } = fakeJoor(2 * L + 1)
    const adapter = new JoorAdapter({ clientId: 'c', clientSecret: 's' })
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await list(adapter, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(hasMore).toEqual([true, true, false])
  })

  it(`${name}: page 2 sends the documented request (no paging keys) and reports pagedLocally`, async () => {
    const L = 3
    const { calls, ids } = fakeJoor(2 * L + 1)
    const adapter = new JoorAdapter({ clientId: 'c', clientSecret: 's' })
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await list(adapter, params)
    const listCall = calls.find((c) => c.path === path)
    // The endpoint documents no paging key: the page is cut locally.
    expect(listCall?.params).toEqual({ account: 'acct-1' })
    expect(rows.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(readUpstreamPage(params)).toMatchObject({
      pagedLocally: true,
      totalCount: 2 * L + 1,
      hasMore: true,
    })
  })

  it(`${name}: a limit above the maximum is clamped and still serves every row`, async () => {
    const N = 2 * MAX_PAGE_LIMIT + 1
    const { ids } = fakeJoor(N)
    const adapter = new JoorAdapter({ clientId: 'c', clientSecret: 's' })
    const seen: string[] = []
    let page = 1
    for (;;) {
      const params = parseListQuery(
        { limit: String(MAX_PAGE_LIMIT * 5), page: String(page) },
        adapter as EcommerceAdapter,
      )
      expect(params.limit).toBe(MAX_PAGE_LIMIT)
      const rows = await list(adapter, params)
      expect(rows.length).toBeLessThanOrEqual(MAX_PAGE_LIMIT)
      seen.push(...rows.map((r) => r.id))
      if (!readUpstreamPage(params)?.hasMore) break
      page++
      expect(page).toBeLessThan(10)
    }
    expect(page).toBe(3)
    expect(seen).toEqual(ids)
  })

  it(`${name}: API path, parseListQuery then listPage, gives the right meta.hasMore`, async () => {
    const { ids } = fakeJoor(5)
    const adapter = new JoorAdapter({ clientId: 'c', clientSecret: 's' })

    const p1 = parseListQuery({ limit: '2', page: '1' }, adapter as EcommerceAdapter)
    const r1 = listPage(await list(adapter, p1), p1, 'joor')
    expect(r1.data.map((r) => r.id)).toEqual(ids.slice(0, 2))
    expect(r1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '2', page: '3' }, adapter as EcommerceAdapter)
    const r3 = listPage(await list(adapter, p3), p3, 'joor')
    expect(r3.data.map((r) => r.id)).toEqual(ids.slice(4))
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('JOOR listProducts SKU lookup', () => {
  it('looks up SKUs for the served page only, and builds options from their traits', async () => {
    const L = 3
    const { calls, ids } = fakeJoor(2 * L + 1)
    const adapter = new JoorAdapter({ clientId: 'c', clientSecret: 's' })
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await adapter.listProducts(CREDS, params)
    const skuCalls = calls.filter((c) => c.path === 'skus')
    expect(skuCalls).toHaveLength(1)
    expect(skuCalls[0]!.params).toEqual({
      account: 'acct-1',
      product_ids: ids.slice(L, 2 * L).join(','),
    })
    expect(rows.map((p) => p.options)).toEqual(
      ids.slice(L, 2 * L).map((id) => [{ name: 'Color', values: [`navy-${id}`] }]),
    )
    // A SKU has no documented price, so no canonical variant is embedded.
    expect(rows.map((p) => p.variants)).toEqual(ids.slice(L, 2 * L).map(() => undefined))
  })

  it('getProduct looks up its SKUs by product_ids and builds options from their traits', async () => {
    const { calls } = fakeJoor(1)
    const adapter = new JoorAdapter({ clientId: 'c', clientSecret: 's' })
    const product = await adapter.getProduct(CREDS, 'id-00000')
    const skuCalls = calls.filter((c) => c.path === 'skus')
    expect(skuCalls).toHaveLength(1)
    expect(skuCalls[0]!.params).toEqual({ account: 'acct-1', product_ids: 'id-00000' })
    expect(product.id).toBe('id-00000')
    expect(product.options).toEqual([{ name: 'Color', values: ['navy-id-00000'] }])
    // A SKU has no documented price, so no canonical variant is embedded.
    expect(product.variants).toBeUndefined()
  })

  it('an empty page makes no SKU request', async () => {
    const { calls } = fakeJoor(2)
    const adapter = new JoorAdapter({ clientId: 'c', clientSecret: 's' })
    const params = withPageSink({ page: 5, limit: 2 } as QueryParams)
    expect(await adapter.listProducts(CREDS, params)).toEqual([])
    expect(calls.filter((c) => c.path === 'skus')).toEqual([])
  })
})

describe('JOOR list filters reach the upstream request', () => {
  // pageLocally windows whatever the upstream returns, so a dropped filter
  // would slice the unfiltered account and report the wrong totalCount.
  it('listProducts forwards collection_ids and product_ids next to account', async () => {
    const { calls } = fakeJoor(3)
    const adapter = new JoorAdapter({ clientId: 'c', clientSecret: 's' })
    const params = withPageSink({
      page: 1,
      limit: 2,
      collection_ids: 'col-1',
      product_ids: 'id-00000,id-00001',
    } as QueryParams)
    await adapter.listProducts(CREDS, params)
    expect(calls.find((c) => c.path === 'products')?.params).toEqual({
      account: 'acct-1',
      collection_ids: 'col-1',
      product_ids: 'id-00000,id-00001',
    })
  })

  it('listCollections forwards collection_ids and archived next to account', async () => {
    const { calls } = fakeJoor(3)
    const adapter = new JoorAdapter({ clientId: 'c', clientSecret: 's' })
    const params = withPageSink({
      page: 1,
      limit: 2,
      collection_ids: 'id-00001',
      archived: 'true',
    } as QueryParams)
    await adapter.listCollections(CREDS, params)
    expect(calls.find((c) => c.path === 'collections')?.params).toEqual({
      account: 'acct-1',
      collection_ids: 'id-00001',
      archived: 'true',
    })
  })
})
