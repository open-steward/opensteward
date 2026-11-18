/**
 * Etsy pages its shop lists by `offset` + `limit` (max 100) and answers with
 * `count`, the total found (getListingsByShop, getShopReceipts). Shop
 * sections (getShopSections) take no paging parameters and return every
 * section. The adapter used to read the offset only from `cursor`/`offset`,
 * never from the caller's `page`, so page 2 repeated page 1.
 *
 * The fake below honours ONLY the documented parameters: `limit` (1..100,
 * default 25) and `offset` on listings and receipts, nothing on sections.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { EtsyAdapter } from '../../../../../../src/verticals/ecommerce/adapters/etsy/index'

const CREDS = {
  accessToken: 'tok',
  refreshToken: 'ref',
  extra: { apiKeyString: 'key123', shopId: 'shop1' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

interface Shop {
  listings?: number
  /** `count` the listings endpoint reports (default: `listings`) */
  listingsCount?: number
  /** products per listing id (default 1) */
  productsPer?: (listingId: number) => number
  receipts?: number
  sections?: number
}

function fakeEtsy(shop: Shop): Call[] {
  const calls: Call[] = []
  function window(total: number, params: Record<string, unknown>): { start: number; end: number } {
    const limit = params['limit'] === undefined ? 25 : Number(params['limit'])
    const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw Object.assign(new Error(`limit ${limit} out of range`), { response: { status: 400 } })
    }
    return { start: offset, end: Math.min(offset + limit, total) }
  }
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = { ...(cfg?.params ?? {}) }
    calls.push({ path, params })
    const inv = /^\/listings\/(\d+)\/inventory$/.exec(path)
    if (inv) {
      const id = Number(inv[1])
      const n = shop.productsPer?.(id) ?? 1
      return {
        data: {
          listing_id: id,
          products: Array.from({ length: n }, (_, i) => ({
            product_id: i + 1,
            sku: `s${id}-${i + 1}`,
            offerings: [{ offering_id: 1, quantity: 1 }],
          })),
        },
      }
    }
    if (path === '/shops/shop1/listings') {
      const total = shop.listings ?? 0
      const { start, end } = window(total, params)
      const results = []
      for (let i = start; i < end; i++) results.push({ listing_id: i + 1, title: `L${i + 1}` })
      return { data: { count: shop.listingsCount ?? total, results } }
    }
    if (path === '/shops/shop1/receipts') {
      const total = shop.receipts ?? 0
      const { start, end } = window(total, params)
      const results = []
      for (let i = start; i < end; i++) results.push({ receipt_id: i + 1 })
      return { data: { count: total, results } }
    }
    if (path === '/shops/shop1/sections') {
      // getShopSections documents no query parameters: every section, always.
      const total = shop.sections ?? 0
      const results = Array.from({ length: total }, (_, i) => ({
        shop_section_id: i + 1,
        title: `S${i + 1}`,
      }))
      return { data: { count: total, results } }
    }
    throw new Error(`unexpected GET ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return calls
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

type ListFn = (a: EtsyAdapter, p: QueryParams) => Promise<{ id: string }[]>

async function walk(
  list: ListFn,
  limit: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: (boolean | undefined)[]; sizes: number[] }> {
  const adapter = new EtsyAdapter()
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const sizes: number[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    const rows = await list(adapter, params)
    ids.push(...rows.map((r) => r.id))
    sizes.push(rows.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, sizes }
}

const seq = (n: number): string[] => Array.from({ length: n }, (_, i) => String(i + 1))

const listProducts: ListFn = (a, p) => a.listProducts(CREDS, p)
const listOrders: ListFn = (a, p) => a.listOrders(CREDS, p)
const listCollections: ListFn = (a, p) => a.listCollections(CREDS, p)
const listInventoryLevels: ListFn = (a, p) => a.listInventoryLevels(CREDS, p)

describe.each([
  ['listProducts', listProducts, '/shops/shop1/listings', 'listings'],
  ['listOrders', listOrders, '/shops/shop1/receipts', 'receipts'],
] as const)('Etsy %s pages by offset', (_name, list, path, field) => {
  it('serves 2L+1 rows over three pages, each once, in order, hasMore exact', async () => {
    const calls = fakeEtsy({ [field]: 7 })
    const r = await walk(list, 3, 3)
    expect(r.ids).toEqual(seq(7))
    expect(r.sizes).toEqual([3, 3, 1])
    expect(r.hasMore).toEqual([true, true, false])
    const listCalls = calls.filter((c) => c.path === path)
    expect(listCalls.map((c) => [c.params['limit'], c.params['offset']])).toEqual([
      [3, 0],
      [3, 3],
      [3, 6],
    ])
  })

  it('ends exactly on a full last page: 2L rows read hasMore [true, false]', async () => {
    fakeEtsy({ [field]: 6 })
    const r = await walk(list, 3, 2)
    expect(r.ids).toEqual(seq(6))
    expect(r.hasMore).toEqual([true, false])
  })

  it('reports the total and the page size it sent', async () => {
    fakeEtsy({ [field]: 7 })
    const params = withPageSink({ page: 2, limit: 3 })
    await list(new EtsyAdapter(), params)
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 7, pageSize: 3 })
    const wide = withPageSink({ page: 1, limit: 250 })
    fakeEtsy({ [field]: 150 })
    await list(new EtsyAdapter(), wide)
    expect(readUpstreamPage(wide)).toMatchObject({ totalCount: 150, pageSize: 100 })
  })

  it('an explicit offset, even as a string, positions the page and reports no total', async () => {
    const calls = fakeEtsy({ [field]: 7 })
    const params = withPageSink({ page: 1, limit: 3, offset: '5' } as QueryParams)
    const rows = await list(new EtsyAdapter(), params)
    expect(rows.map((r) => r.id)).toEqual(['6', '7'])
    expect(calls.find((c) => c.path === path)?.params).toMatchObject({ limit: 3, offset: 5 })
    const report = readUpstreamPage(params)
    expect(report?.hasMore).toBe(false)
    expect(report?.totalCount).toBeUndefined()
  })

  it('the page-2 request carries offset', async () => {
    const calls = fakeEtsy({ [field]: 7 })
    await list(new EtsyAdapter(), withPageSink({ page: 2, limit: 3 }))
    expect(calls.find((c) => c.path === path)?.params).toMatchObject({ limit: 3, offset: 3 })
  })

  it('clamps a limit above 100 and still serves every row', async () => {
    const calls = fakeEtsy({ [field]: 150 })
    const r = await walk(list, 250, 2)
    expect(r.ids).toEqual(seq(150))
    expect(r.hasMore).toEqual([true, false])
    expect(calls.every((c) => Number(c.params['limit']) <= 100)).toBe(true)
  })

  it('reports meta.hasMore through parseListQuery and listPage', async () => {
    fakeEtsy({ [field]: 7 })
    const adapter = new EtsyAdapter()
    const p2 = parseListQuery({ limit: '3', page: '2' })
    const env2 = listPage(await list(adapter, p2), p2, 'etsy')
    expect(env2.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(env2.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: '3', page: '3' })
    const env3 = listPage(await list(adapter, p3), p3, 'etsy')
    expect(env3.data.map((r) => r.id)).toEqual(['7'])
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('Etsy listCollections pages the whole section list locally', () => {
  it('serves 2L+1 sections over three pages, each once, hasMore exact', async () => {
    const calls = fakeEtsy({ sections: 7 })
    const r = await walk(listCollections, 3, 3)
    expect(r.ids).toEqual(seq(7))
    expect(r.hasMore).toEqual([true, true, false])
    // getShopSections documents no limit or offset: none is sent.
    for (const c of calls) expect(c.params).toEqual({})
  })

  it('serves every section at a limit above 100', async () => {
    fakeEtsy({ sections: 150 })
    const r = await walk(listCollections, 250, 1)
    expect(r.ids).toEqual(seq(150))
    expect(r.hasMore).toEqual([false])
  })

  it('reports meta.hasMore through parseListQuery and listPage', async () => {
    fakeEtsy({ sections: 7 })
    const adapter = new EtsyAdapter()
    const p = parseListQuery({ limit: '3', page: '2' })
    const env = listPage(await listCollections(adapter, p), p, 'etsy')
    expect(env.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('Etsy listInventoryLevels pages the flattened levels by rows', () => {
  // Listings alternate 1 and 2 products: 5 listings → 1+2+1+2+1 = 7 levels.
  const productsPer = (id: number): number => (id % 2 === 0 ? 2 : 1)
  const levelIds = (listings: number, per: (id: number) => number = productsPer): string[] => {
    const out: string[] = []
    for (let id = 1; id <= listings; id++) for (let p = 1; p <= per(id); p++) out.push(`${id}:${p}`)
    return out
  }

  it('serves 2L+1 levels over three pages, each once, in order, hasMore exact', async () => {
    fakeEtsy({ listings: 5, productsPer })
    const r = await walk(listInventoryLevels, 3, 3)
    expect(r.ids).toEqual(levelIds(5))
    expect(r.sizes).toEqual([3, 3, 1])
    expect(r.hasMore).toEqual([true, true, false])
  })

  it('the page-2 request of a long shop carries offset', async () => {
    // 60 listings of one product each; the parent pages are 25 listings.
    const calls = fakeEtsy({ listings: 60 })
    const r = await walk(listInventoryLevels, 25, 3)
    expect(r.ids).toEqual(levelIds(60, () => 1))
    expect(r.hasMore).toEqual([true, true, false])
    const listingCalls = calls.filter((c) => c.path === '/shops/shop1/listings')
    expect(listingCalls.map((c) => c.params['offset'])).toEqual([0, 25, 50])
    expect(listingCalls.every((c) => c.params['state'] === 'active')).toBe(true)
  })

  it('clamps nothing upstream past 100 and serves every level at a limit of 250', async () => {
    const calls = fakeEtsy({ listings: 150 })
    const r = await walk(listInventoryLevels, 250, 1)
    expect(r.ids).toEqual(levelIds(150, () => 1))
    expect(r.hasMore).toEqual([false])
    expect(
      calls.every((c) => c.params['limit'] === undefined || Number(c.params['limit']) <= 100),
    ).toBe(true)
  })

  it('reports meta.hasMore through parseListQuery and listPage', async () => {
    fakeEtsy({ listings: 5, productsPer })
    const adapter = new EtsyAdapter()
    const p = parseListQuery({ limit: '3', page: '2' })
    const env = listPage(await listInventoryLevels(adapter, p), p, 'etsy')
    expect(env.data.map((r) => r.id)).toEqual(levelIds(5).slice(3, 6))
    expect(env.meta.hasMore).toBe(true)
  })

  it('keys its walk per connection: another token on the same shop walks afresh', async () => {
    const calls = fakeEtsy({ listings: 5, productsPer })
    const adapter = new EtsyAdapter()
    await adapter.listInventoryLevels(CREDS, withPageSink({ page: 1, limit: 3 }))
    const before = calls.length
    const other = { ...CREDS, accessToken: 'tok-b', refreshToken: 'ref-b' }
    const rows = await adapter.listInventoryLevels(other, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(levelIds(5).slice(3, 6))
    // A cold walk for the second connection starts from the first listing page.
    const listingCalls = calls.slice(before).filter((c) => c.path === '/shops/shop1/listings')
    expect(listingCalls.map((c) => c.params['offset'])).toEqual([0])
  })

  it('stops on an empty listing page even when count overstates the listings', async () => {
    // Etsy reports 30 but only 25 exist (a listing deactivated mid-walk).
    const calls = fakeEtsy({ listings: 25, listingsCount: 30 })
    const r = await walk(listInventoryLevels, 100, 1)
    expect(r.ids).toEqual(levelIds(25, () => 1))
    expect(r.hasMore).toEqual([false])
    const listingCalls = calls.filter((c) => c.path === '/shops/shop1/listings')
    expect(listingCalls.map((c) => c.params['offset'])).toEqual([0, 25])
  })

  it('one listing: pages its levels locally', async () => {
    fakeEtsy({ listings: 1, productsPer: () => 7 })
    const adapter = new EtsyAdapter()
    const ids: string[] = []
    const more: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 3, listingId: '1' })
      ids.push(...(await adapter.listInventoryLevels(CREDS, params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(Array.from({ length: 7 }, (_, i) => `1:${i + 1}`))
    expect(more).toEqual([true, true, false])
  })
})

describe('Etsy page maximum', () => {
  it('declares no maxPageSize while receipt-scoped lists return whole receipts unpaged', () => {
    // listFulfillments, listRefunds and listTransactions do not page, so the
    // adapter may not vouch for a router-wide maximum.
    const caps = (new EtsyAdapter() as { capabilities?: { maxPageSize?: number } }).capabilities
    expect(caps?.maxPageSize).toBeUndefined()
  })
})
