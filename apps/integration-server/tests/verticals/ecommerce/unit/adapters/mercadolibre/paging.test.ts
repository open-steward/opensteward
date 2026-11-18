/**
 * Paging for Mercado Libre's list methods, against the first-party docs.
 *
 * https://developers.mercadolibre.com.ar/en_us/design-considerations —
 * "You can define the page size of the result list. There are 2 parameters:
 * limit and offset. Both parameters define the size block of the results."
 * Every endpoint below answers with `paging: { total, offset, limit }`.
 *
 * - GET /users/{id}/items/search (listProducts, listInventoryLevels):
 *   https://developers.mercadolibre.com.ar/en_us/items-and-searches — "You can
 *   add a maximum limit of 100." Returns item IDs only; the bodies come from
 *   the multiget GET /items?ids=, which reaches "a maximum of 20 results".
 * - GET /orders/search?seller= (listOrders): no documented maximum.
 * - GET /seller-promotions/users/{id}?app_version=v2 (listDiscounts): no
 *   documented maximum for this endpoint.
 *   Both examples echo `limit: 50`, so the adapter asks for no more than 50,
 *   and the fake here silently serves at most 50 whatever limit it is sent: an
 *   adapter that trusted a larger limit would skip rows at the next offset.
 *
 * Each method used to read `params.offset`, which the router never sets (and
 * listDiscounts sent no paging parameter at all), so page 2 repeated page 1.
 * The fake upstream honours only the documented parameters.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  effectivePageSize,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { MercadoLibreAdapter } from '../../../../../../src/verticals/ecommerce/adapters/mercadolibre/index'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const USER = '12345'
const CREDS: Credentials = { accessToken: 'tok', extra: { userId: USER } }

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

const ITEMS_MAX = 100
const MULTIGET_MAX = 20
/** What the fake silently serves on orders/promotions, whatever limit is sent. */
const SEARCH_SERVES = 50

function offsetPage(
  params: Record<string, unknown> | undefined,
  max: number,
  label: string,
): { start: number; limit: number } {
  const limit = Number(params?.['limit'] ?? 50)
  const offset = Number(params?.['offset'] ?? 0)
  if (!Number.isInteger(limit) || limit < 1 || limit > max)
    throw new Error(`${label}: limit ${limit} outside 1..${max}`)
  if (!Number.isInteger(offset) || offset < 0) throw new Error(`${label}: bad offset ${offset}`)
  return { start: offset, limit }
}

interface FakeOptions {
  /** Item indexes the multiget answers with a failed entry (code 404, no id). */
  failItems?: ReadonlySet<number>
  /** A `paging.total` larger than the rows the search really serves. */
  claimedTotal?: number
}

function fakeMeli(n: number, opts: FakeOptions = {}): Call[] {
  const calls: Call[] = []
  const itemId = (i: number) => `MLA${1000 + i}`
  const respond = (path: string, params: Record<string, unknown> | undefined) => {
    calls.push({ path, params })
    if (path === `/users/${USER}/items/search`) {
      const { start, limit } = offsetPage(params, ITEMS_MAX, path)
      const ids = Array.from({ length: n }, (_, i) => itemId(i)).slice(start, start + limit)
      return {
        data: { results: ids, paging: { total: opts.claimedTotal ?? n, offset: start, limit } },
      }
    }
    if (path === '/items') {
      const ids = String(params?.['ids'] ?? '')
        .split(',')
        .filter(Boolean)
      if (ids.length < 1 || ids.length > MULTIGET_MAX)
        throw new Error(`/items: ${ids.length} ids outside 1..${MULTIGET_MAX}`)
      return {
        data: ids.map((id) =>
          opts.failItems?.has(Number(id.slice(3)) - 1000)
            ? { code: 404, body: { error: 'not_found', message: 'Item not found' } }
            : {
                code: 200,
                body: { id, title: `Item ${id}`, status: 'active', available_quantity: 3 },
              },
        ),
      }
    }
    if (path === '/orders/search') {
      if (params?.['seller'] !== USER) throw new Error('/orders/search: seller required')
      const { start, limit: sent } = offsetPage(params, Infinity, path)
      const limit = Math.min(sent, SEARCH_SERVES)
      const rows = Array.from({ length: n }, (_, i) => ({
        id: 4000 + i,
        status: 'paid',
        currency_id: 'ARS',
        total_amount: 1,
        date_created: '2024-05-01T10:00:00.000Z',
        last_updated: '2024-05-01T10:00:00.000Z',
      })).slice(start, start + limit)
      return {
        data: { results: rows, paging: { total: opts.claimedTotal ?? n, offset: start, limit } },
      }
    }
    if (path === `/seller-promotions/users/${USER}`) {
      if (params?.['app_version'] !== 'v2') throw new Error('promotions: app_version=v2 required')
      const { start, limit: sent } = offsetPage(params, Infinity, path)
      const limit = Math.min(sent, SEARCH_SERVES)
      const rows = Array.from({ length: n }, (_, i) => ({
        id: `C-MLA${i}`,
        type: 'SELLER_CAMPAIGN',
        name: `Promo ${i}`,
        start_date: '2024-05-01T10:00:00.000Z',
      })).slice(start, start + limit)
      return {
        data: { results: rows, paging: { total: opts.claimedTotal ?? n, offset: start, limit } },
      }
    }
    throw new Error(`unexpected path ${path}`)
  }
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get: vi.fn(async (path: string, c?: { params?: Record<string, unknown> }) =>
      respond(path, c?.params),
    ),
  })) as never)
  return calls
}

type ListMethod = 'listProducts' | 'listInventoryLevels' | 'listOrders' | 'listDiscounts'

const EXPECTED_ID: Record<ListMethod, (i: number) => string> = {
  listProducts: (i) => `MLA${1000 + i}`,
  listInventoryLevels: (i) => `MLA${1000 + i}:meli-default`,
  listOrders: (i) => String(4000 + i),
  listDiscounts: (i) => `C-MLA${i}`,
}

const LIST_PATH: Record<ListMethod, string> = {
  listProducts: `/users/${USER}/items/search`,
  listInventoryLevels: `/users/${USER}/items/search`,
  listOrders: '/orders/search',
  listDiscounts: `/seller-promotions/users/${USER}`,
}

/** The adapter as the router holds it, so parseListQuery reads its capabilities. */
function routed(): EcommerceAdapter {
  return new MercadoLibreAdapter()
}

async function call(method: ListMethod, params: QueryParams): Promise<Array<{ id: string }>> {
  const adapter = new MercadoLibreAdapter()
  return adapter[method](CREDS, params) as Promise<Array<{ id: string }>>
}

async function drive(method: ListMethod, limit: number, pages: number) {
  const seen: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await call(method, params)
    seen.push(...rows.map((r) => r.id))
    const meta = readUpstreamPage(params)
    const size = meta?.pageSize ?? limit
    hasMore.push(
      meta?.hasMore ?? (meta?.totalCount === undefined ? undefined : page * size < meta.totalCount),
    )
  }
  return { seen, hasMore }
}

/**
 * The sync worker's loop: page at limit 500 (no maxPageSize is declared),
 * stop on a reported hasMore when there is one, else on a short page judged at
 * the reported page size.
 */
async function sync(method: ListMethod): Promise<{ seen: string[]; pages: number }> {
  const seen: string[] = []
  for (let page = 1; page <= 50; page++) {
    const params = withPageSink({ page, limit: 500 })
    const rows = await call(method, params)
    seen.push(...rows.map((r) => r.id))
    const reported = readUpstreamPage(params)?.hasMore
    const last =
      typeof reported === 'boolean' ? !reported : rows.length < effectivePageSize(params, 500)
    if (last) return { seen, pages: page }
  }
  throw new Error('sync did not end')
}

afterEach(() => {
  vi.restoreAllMocks()
})

const METHODS: ListMethod[] = ['listProducts', 'listInventoryLevels', 'listOrders', 'listDiscounts']

describe('Mercado Libre paging', () => {
  for (const method of METHODS) {
    describe(method, () => {
      it('serves every row once over pages 1..3 with an exact hasMore', async () => {
        const L = 7
        const N = 2 * L + 1
        fakeMeli(N)
        const { seen, hasMore } = await drive(method, L, 3)
        expect(seen).toEqual(Array.from({ length: N }, (_, i) => EXPECTED_ID[method](i)))
        expect(hasMore).toEqual([true, true, false])
      })

      it('sends the documented offset on page 2', async () => {
        const calls = fakeMeli(20)
        await call(method, withPageSink({ page: 2, limit: 7 }))
        const list = calls.filter((c) => c.path === LIST_PATH[method])
        expect(list).toHaveLength(1)
        expect(list[0]!.params).toMatchObject({ limit: 7, offset: 7 })
      })

      it('meta.hasMore is right through parseListQuery + listPage', async () => {
        fakeMeli(15)
        const params = parseListQuery({ page: '2', limit: '7' }, routed())
        const rows = await call(method, params)
        const env = listPage(rows, params, 'mercadolibre')
        expect(env.data.map((r) => r.id)).toEqual(
          Array.from({ length: 7 }, (_, i) => EXPECTED_ID[method](7 + i)),
        )
        expect(env.meta.hasMore).toBe(true)

        fakeMeli(14)
        const last = parseListQuery({ page: '2', limit: '7' }, routed())
        const env2 = listPage(await call(method, last), last, 'mercadolibre')
        expect(env2.meta.hasMore).toBe(false)
      })
    })
  }

  for (const method of ['listProducts', 'listInventoryLevels'] as const) {
    it(`${method} clamps a limit above 100 and still serves every row`, async () => {
      const N = 2 * ITEMS_MAX + 1
      const calls = fakeMeli(N)
      const { seen, hasMore } = await drive(method, 150, 3)
      expect(seen).toEqual(Array.from({ length: N }, (_, i) => EXPECTED_ID[method](i)))
      expect(hasMore).toEqual([true, true, false])
      const searches = calls.filter((c) => c.path === LIST_PATH[method])
      expect(searches.map((c) => c.params)).toEqual([
        { limit: 100, offset: 0 },
        { limit: 100, offset: 100 },
        { limit: 100, offset: 200 },
      ])
    })

    it(`${method} splits the item multiget into batches of at most 20`, async () => {
      const calls = fakeMeli(60)
      const rows = await call(method, withPageSink({ page: 1, limit: 50 }))
      expect(rows.map((r) => r.id)).toEqual(
        Array.from({ length: 50 }, (_, i) => EXPECTED_ID[method](i)),
      )
      const gets = calls.filter((c) => c.path === '/items')
      expect(gets.map((c) => String(c.params?.['ids']).split(',').length)).toEqual([20, 20, 10])
    })
  }

  it('listProducts reports the clamped page size so the router judges pages by it', async () => {
    fakeMeli(250)
    const params = parseListQuery({ page: '1', limit: '150' }, routed())
    const env = listPage(await call('listProducts', params), params, 'mercadolibre')
    expect(env.data).toHaveLength(100)
    expect(env.meta.limit).toBe(100)
    expect(env.meta.hasMore).toBe(true)
  })
  for (const method of METHODS) {
    it(`${method} syncs every row at the sync worker's limit of 500`, async () => {
      const N = 2 * 250 + 1
      fakeMeli(N)
      const { seen } = await sync(method)
      expect(seen).toEqual(Array.from({ length: N }, (_, i) => EXPECTED_ID[method](i)))
    })
  }

  for (const method of ['listOrders', 'listDiscounts'] as const) {
    it(`${method} asks for at most 50 and reports that size`, async () => {
      const calls = fakeMeli(200)
      const params = withPageSink({ page: 2, limit: 500 })
      const rows = await call(method, params)
      expect(rows.map((r) => r.id)).toEqual(
        Array.from({ length: 50 }, (_, i) => EXPECTED_ID[method](50 + i)),
      )
      expect(calls.filter((c) => c.path === LIST_PATH[method])[0]!.params).toMatchObject({
        limit: 50,
        offset: 50,
      })
      expect(readUpstreamPage(params)).toMatchObject({ pageSize: 50, hasMore: true })
    })
  }

  for (const method of ['listProducts', 'listInventoryLevels'] as const) {
    it(`${method}: a failed multiget entry does not end the sync early`, async () => {
      const N = 250
      fakeMeli(N, { failItems: new Set([5]) })
      const { seen, pages } = await sync(method)
      const expected = Array.from({ length: N }, (_, i) => i)
        .filter((i) => i !== 5)
        .map((i) => EXPECTED_ID[method](i))
      expect(seen).toEqual(expected)
      expect(pages).toBe(3)
    })
  }

  for (const method of METHODS) {
    it(`${method}: an empty page ends the collection even when paging.total says more`, async () => {
      fakeMeli(10, { claimedTotal: 5000 })
      const params = withPageSink({ page: 3, limit: 7 })
      expect(await call(method, params)).toEqual([])
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
      const { seen, pages } = await sync(method)
      expect(seen).toHaveLength(10)
      expect(pages).toBeLessThanOrEqual(2)
    })
  }
})
