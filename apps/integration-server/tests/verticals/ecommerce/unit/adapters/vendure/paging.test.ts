/**
 * Paging for Vendure's top-level list methods, against the Admin GraphQL API
 * reference (https://docs.vendure.io/current/core/reference/graphql-api/admin/input-types):
 *
 *   input ProductListOptions {
 *     """Skips the first n results, for use in pagination"""
 *     skip: Int
 *     """Takes n results, for use in pagination"""
 *     take: Int
 *
 * and the same `skip` / `take` on ProductVariantListOptions,
 * CollectionListOptions, StockLocationListOptions, CustomerListOptions,
 * OrderListOptions and PromotionListOptions. Every list type answers
 * `{ items, totalItems }` (object-types page). The Admin API's
 * `adminListQueryLimit` defaults to 1000 and a larger `take` is refused
 * (api-options: "this is the upper limit of the `take` input option").
 *
 * All seven methods used to go through `client.paginateList`, which started
 * at skip=0 on every call and looped until `totalItems`, so page 2 sent the
 * same request as page 1 and every call fetched the whole collection. It also
 * clamped `take` to 100, the Shop API default. The fake upstream here honours
 * only `skip` and `take`, and refuses a `take` over 1000.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { VendureAdapter } from '../../../../../../src/verticals/ecommerce/adapters/vendure'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const CREDS: Credentials = {
  accessToken: 'tok',
  extra: { apiUrl: 'https://shop.example.com/admin-api' },
}

const ADMIN_LIST_QUERY_LIMIT = 1000

interface Call {
  dataKey: string
  options: Record<string, unknown> | undefined
}

type ListMethod =
  | 'listProducts'
  | 'listVariants'
  | 'listCollections'
  | 'listLocations'
  | 'listCustomers'
  | 'listOrders'
  | 'listDiscounts'

const METHODS: Array<{ method: ListMethod; dataKey: string }> = [
  { method: 'listProducts', dataKey: 'products' },
  { method: 'listVariants', dataKey: 'productVariants' },
  { method: 'listCollections', dataKey: 'collections' },
  { method: 'listLocations', dataKey: 'stockLocations' },
  { method: 'listCustomers', dataKey: 'customers' },
  { method: 'listOrders', dataKey: 'orders' },
  { method: 'listDiscounts', dataKey: 'promotions' },
]

function rowsFor(dataKey: string, n: number): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) => ({
    id: `${dataKey}-${i}`,
    name: `${dataKey} ${i}`,
    code: `C${i}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }))
}

/** A Vendure Admin API that honours only `options.skip` and `options.take`. */
function fakeVendure(dataKey: string, n: number): Call[] {
  const calls: Call[] = []
  const rows = rowsFor(dataKey, n)
  vi.spyOn(axios, 'post').mockImplementation((async (_url: string, body: unknown) => {
    const { variables } = body as { variables?: { options?: Record<string, unknown> } }
    const options = variables?.options
    calls.push({ dataKey, options })
    const skip = Number(options?.['skip'] ?? 0)
    const take = options?.['take'] === undefined ? rows.length : Number(options['take'])
    if (take > ADMIN_LIST_QUERY_LIMIT) {
      return {
        data: {
          errors: [
            { message: `error.list-query-limit-exceeded (limit ${ADMIN_LIST_QUERY_LIMIT})` },
          ],
        },
      }
    }
    return {
      data: {
        data: { [dataKey]: { items: rows.slice(skip, skip + take), totalItems: rows.length } },
      },
    }
  }) as never)
  return calls
}

async function call(method: ListMethod, params: QueryParams): Promise<Array<{ id: string }>> {
  const adapter = new VendureAdapter({ apiUrl: '', appToken: '' })
  return adapter[method](CREDS, params) as Promise<Array<{ id: string }>>
}

async function drive(method: ListMethod, limit: number, pages: number) {
  const seen: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await call(method, params)
    seen.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, hasMore }
}

afterEach(() => vi.restoreAllMocks())

describe.each(METHODS)('Vendure $method paging', ({ method, dataKey }) => {
  it('serves 2L+1 rows over three pages, each once, in order, with exact hasMore', async () => {
    const L = 2
    fakeVendure(dataKey, 2 * L + 1)
    const { seen, hasMore } = await drive(method, L, 3)
    expect(seen).toEqual(rowsFor(dataKey, 2 * L + 1).map((r) => r.id))
    expect(hasMore).toEqual([true, true, false])
  })

  it('ends exactly when the row count is a multiple of the limit (N=2L)', async () => {
    const L = 2
    const calls = fakeVendure(dataKey, 2 * L)
    const { seen, hasMore } = await drive(method, L, 2)
    expect(seen).toEqual(rowsFor(dataKey, 2 * L).map((r) => r.id))
    // A full-page guess would say true on page 2 and cost an empty request.
    expect(hasMore).toEqual([true, false])
    expect(calls).toHaveLength(2)
  })

  it('reports totalItems as the exact totalCount', async () => {
    fakeVendure(dataKey, 4)
    const params = withPageSink({ page: 2, limit: 2 })
    await call(method, params)
    expect(readUpstreamPage(params)?.totalCount).toBe(4)
  })

  it('sends skip and take for page 2', async () => {
    const calls = fakeVendure(dataKey, 5)
    await call(method, withPageSink({ page: 2, limit: 2 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]?.options).toMatchObject({ skip: 2, take: 2 })
  })

  it('clamps a limit past adminListQueryLimit and still serves every row', async () => {
    const n = 2 * ADMIN_LIST_QUERY_LIMIT + 1
    const calls = fakeVendure(dataKey, n)
    const { seen, hasMore } = await drive(method, ADMIN_LIST_QUERY_LIMIT + 1, 3)
    expect(seen).toEqual(rowsFor(dataKey, n).map((r) => r.id))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.options?.['take'])).toEqual([1000, 1000, 1000])
    // The clamped size is reported, so listPage judges the page at 1000, not 1001.
    const params = withPageSink({ page: 1, limit: ADMIN_LIST_QUERY_LIMIT + 1 })
    await call(method, params)
    expect(readUpstreamPage(params)?.pageSize).toBe(ADMIN_LIST_QUERY_LIMIT)
  })

  it('gives the right meta.hasMore through parseListQuery and listPage', async () => {
    fakeVendure(dataKey, 5)
    const adapter: EcommerceAdapter = new VendureAdapter({ apiUrl: '', appToken: '' })
    const results: Array<boolean | null> = []
    for (const page of ['2', '3']) {
      const params = parseListQuery({ limit: '2', page }, adapter)
      const env = listPage(await call(method, params), params, 'vendure')
      results.push(env.meta.hasMore)
    }
    expect(results).toEqual([true, false])
  })

  it('gives exact meta through listPage when N is a multiple of the limit', async () => {
    fakeVendure(dataKey, 4)
    const adapter: EcommerceAdapter = new VendureAdapter({ apiUrl: '', appToken: '' })
    const metas: Array<{ hasMore: boolean | null; totalCount: number | null }> = []
    for (const page of ['1', '2']) {
      const params = parseListQuery({ limit: '2', page }, adapter)
      const env = listPage(await call(method, params), params, 'vendure')
      metas.push({ hasMore: env.meta.hasMore, totalCount: env.meta.totalCount })
    }
    expect(metas).toEqual([
      { hasMore: true, totalCount: 4 },
      { hasMore: false, totalCount: 4 },
    ])
  })
})
