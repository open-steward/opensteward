/**
 * Flipkart inventory-levels paging contract.
 *
 * Inventory comes out of the Listings v3 API in two steps
 * (https://seller.flipkart.com/api-docs/listing-api-docs/LMAPIRef.html):
 *
 *   - `POST /listings/v3/search` returns the seller's listings "in a batch of
 *     500" with no size parameter. "Provide null as the page_id when
 *     retrieving the first page. For subsequent pages, use the next_page_id
 *     from the previous response as the page_id, but only if has_more field
 *     is true."
 *   - `POST /listings/v3/details` takes `sku_ids`, "Maximum: 10", and returns
 *     each listing with its locations. One InventoryLevel per listing x
 *     location.
 *
 * One upstream page is therefore not one caller page, so the adapter must cut
 * the caller's rows out of the stream (pageByRows). The fake upstream below
 * honours only the documented request keys: `page_id` on search, `sku_ids`
 * (at most 10) on details. Anything else is ignored, as a real server would.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { FlipkartAdapter } from '../../../../../../src/verticals/ecommerce/adapters/flipkart/index'

const CREDS = { accessToken: 'fk-token' }

interface Call {
  path: string
  body: Record<string, unknown>
}

interface Listing {
  sku_id: string
  listing_id: string
  locations: Array<{ id: string; inventory: number }>
}

/**
 * Listings whose locations flatten to exactly `rows` inventory levels. The
 * location counts cycle 1, 2, 0, 1 so rows do not line up with listings or
 * with 10-SKU detail batches.
 */
function makeListings(rows: number, prefix = 'SKU'): { listings: Listing[]; ids: string[] } {
  const pattern = [1, 2, 0, 1]
  const listings: Listing[] = []
  const ids: string[] = []
  for (let i = 0; ids.length < rows; i++) {
    const sku = `${prefix}-${String(i + 1).padStart(5, '0')}`
    const want = Math.min(pattern[i % pattern.length]!, rows - ids.length)
    const locations = Array.from({ length: want }, (_, k) => ({
      id: `LOC${k + 1}`,
      inventory: i + k,
    }))
    for (const l of locations) ids.push(`${sku}:${l.id}`)
    listings.push({ sku_id: sku, listing_id: `L-${sku}`, locations })
  }
  return { listings, ids }
}

interface FakeOptions {
  /** SKU prefix, so two sellers' datasets are distinguishable. */
  prefix?: string
  /** Insert an empty search page (listings: [], has_more: true) before these search-page indices. */
  emptyBefore?: number[]
}

/**
 * One seller's Flipkart. Search pages are precomputed chunks of `searchBatch`
 * listings (plus any empty pages asked for). Per the docs `next_page_id` is
 * Mandatory, so the last page carries one too: it is only to be followed
 * "if has_more field is true", and this server rejects it with a 400.
 */
function makeServer(rows: number, searchBatch = 500, opts: FakeOptions = {}) {
  const { listings, ids } = makeListings(rows, opts.prefix)
  const pages: Listing[][] = []
  for (let i = 0; i < listings.length; i += searchBatch) {
    if (opts.emptyBefore?.includes(pages.length)) pages.push([])
    pages.push(listings.slice(i, i + searchBatch))
  }
  if (pages.length === 0) pages.push([])
  const calls: Call[] = []
  const token = (n: number): string =>
    Buffer.from(`fk-page:${opts.prefix ?? 'SKU'}:${n}`).toString('base64')
  const post = vi.fn(async (path: string, body?: Record<string, unknown>) => {
    const b = body ?? {}
    calls.push({ path, body: b })
    if (path === '/listings/v3/search') {
      // Documented: page_id null (or absent) is the first page; otherwise a
      // next_page_id this server minted. Fixed batch, no size parameter.
      const pageId = b['page_id']
      let n = 0
      if (pageId !== null && pageId !== undefined) {
        const decoded = /^fk-page:([^:]+):(\d+)$/.exec(
          Buffer.from(String(pageId), 'base64').toString(),
        )
        if (!decoded || decoded[1] !== (opts.prefix ?? 'SKU') || Number(decoded[2]) >= pages.length)
          throw Object.assign(new Error('400 invalid page_id'), { response: { status: 400 } })
        n = Number(decoded[2])
      }
      const hasMore = n + 1 < pages.length
      return {
        data: {
          listings: pages[n]!.map((l) => ({ sku_id: l.sku_id, listing_id: l.listing_id })),
          has_more: hasMore,
          next_page_id: token(n + 1),
        },
      }
    }
    if (path === '/listings/v3/details') {
      const skuIds = b['sku_ids']
      if (!Array.isArray(skuIds) || skuIds.length === 0) {
        throw Object.assign(new Error('400 sku_ids required'), { response: { status: 400 } })
      }
      if (skuIds.length > 10) {
        throw Object.assign(new Error('400 max 10 sku_ids'), { response: { status: 400 } })
      }
      const available: Record<string, Listing> = {}
      for (const s of skuIds) {
        const l = listings.find((x) => x.sku_id === s)
        if (l) available[s as string] = l
      }
      return { data: { available } }
    }
    throw new Error(`unexpected path in test: ${path}`)
  })
  return { post, calls, ids, listings, token }
}

function fakeFlipkart(rows: number, searchBatch = 500, opts: FakeOptions = {}) {
  const server = makeServer(rows, searchBatch, opts)
  vi.spyOn(axios, 'create').mockReturnValue({ post: server.post, defaults: {} } as never)
  return server
}

/** Several sellers, routed by the bearer token the client was built with. */
function fakeSellers(byToken: Record<string, ReturnType<typeof makeServer>>) {
  vi.spyOn(axios, 'create').mockImplementation(((config?: { headers?: Record<string, string> }) => {
    const auth = config?.headers?.['Authorization'] ?? ''
    const server = byToken[auth.replace(/^Bearer /, '')]
    if (!server) throw new Error(`no fake seller for ${auth}`)
    return { post: server.post, defaults: {} }
  }) as never)
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

describe('Flipkart listInventoryLevels paging', () => {
  it('serves 2L+1 levels once each, in order, across pages 1..3 with exact hasMore', async () => {
    for (const [L, batch] of [
      [4, 500],
      [7, 3],
      [25, 11],
    ] as const) {
      _resetRowPager()
      const { ids } = fakeFlipkart(2 * L + 1, batch)
      const adapter = new FlipkartAdapter()
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        const rows = await adapter.listInventoryLevels(CREDS, params)
        seen.push(...rows.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids)
      expect(hasMore).toEqual([true, true, false])
      vi.restoreAllMocks()
    }
  })

  it('page 2 walks the search chain with page_id and details with sku_ids', async () => {
    const L = 5
    const { calls, token } = fakeFlipkart(2 * L + 1, 2)
    const adapter = new FlipkartAdapter()
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await adapter.listInventoryLevels(CREDS, params)
    expect(rows).toHaveLength(L)
    const searches = calls.filter((c) => c.path === '/listings/v3/search')
    expect(searches[0]!.body).toEqual({ page_id: null })
    // The second search page is fetched with the documented request key.
    expect(searches[1]!.body).toEqual({ page_id: token(1) })
    expect(searches.every((c) => !('next_page_id' in c.body))).toBe(true)
    const details = calls.filter((c) => c.path === '/listings/v3/details')
    expect(details.length).toBeGreaterThan(0)
    for (const d of details) {
      expect(Object.keys(d.body)).toEqual(['sku_ids'])
      expect((d.body['sku_ids'] as string[]).length).toBeLessThanOrEqual(10)
    }
  })

  it('page 1 of a small limit does not fetch every listing', async () => {
    const { calls } = fakeFlipkart(200, 500)
    const adapter = new FlipkartAdapter()
    const params = withPageSink({ page: 1, limit: 3 } as QueryParams)
    const rows = await adapter.listInventoryLevels(CREDS, params)
    expect(rows).toHaveLength(3)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    // one search + the detail batches needed for 3 rows (plus a peek at most)
    expect(calls.length).toBeLessThanOrEqual(3)
  })

  it('clamps a limit above the router maximum and still serves every row', async () => {
    const first = parseListQuery({ limit: '5000', page: '1' })
    const MAX = first.limit!
    expect(MAX).toBeLessThan(5000)
    const { ids } = fakeFlipkart(2 * MAX + 1, 500)
    const adapter = new FlipkartAdapter()
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(10)
      const params = withPageSink(parseListQuery({ limit: '5000', page: String(page) }))
      const rows = await adapter.listInventoryLevels(CREDS, params)
      expect(rows.length).toBeLessThanOrEqual(MAX)
      seen.push(...rows.map((r) => r.id))
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(ids)
  })

  it('caller-supplied skuIds are paged too, 10 SKUs per details call', async () => {
    const { calls, listings } = fakeFlipkart(40, 500)
    const adapter = new FlipkartAdapter()
    const chosen = listings.filter((l) => l.locations.length > 0).slice(0, 12)
    const expected = chosen.flatMap((l) => l.locations.map((loc) => `${l.sku_id}:${loc.id}`))
    const skuIds = chosen.map((l) => l.sku_id).join(',')
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(20)
      const params = withPageSink({ page, limit: 4, skuIds } as QueryParams)
      const rows = await adapter.listInventoryLevels(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(expected)
    expect(calls.some((c) => c.path === '/listings/v3/search')).toBe(false)
    // Exactly the documented maximum per details call: 12 SKUs is 10 + 2.
    const sizes = calls
      .filter((c) => c.path === '/listings/v3/details')
      .map((c) => (c.body['sku_ids'] as string[]).length)
    expect([...new Set(sizes)].sort((a, b) => b - a)).toEqual([10, 2])
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const { ids } = fakeFlipkart(5, 2)
    const adapter = new FlipkartAdapter()

    const p1 = parseListQuery({ limit: '2', page: '1' })
    const r1 = listPage(await adapter.listInventoryLevels(CREDS, p1), p1, 'flipkart')
    expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 2))
    expect(r1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '2', page: '3' })
    const r3 = listPage(await adapter.listInventoryLevels(CREDS, p3), p3, 'flipkart')
    expect(r3.data.map((d) => d.id)).toEqual(ids.slice(4))
    expect(r3.meta.hasMore).toBe(false)
  })

  it('stops at has_more false even though the last page still carries a next_page_id', async () => {
    // Docs: next_page_id is Mandatory in the response; follow it "only if
    // has_more field is true". The fake 400s on the last page's token.
    const { ids, calls } = fakeFlipkart(9, 2)
    const adapter = new FlipkartAdapter()
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(10)
      const params = withPageSink({ page, limit: 4 } as QueryParams)
      const rows = await adapter.listInventoryLevels(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(ids)
    expect(
      calls
        .filter((c) => c.path === '/listings/v3/details')
        .every((c) => (c.body['sku_ids'] as string[]).length > 0),
    ).toBe(true)
  })

  it('an empty search page with has_more true is skipped without a details call', async () => {
    const { ids, calls } = fakeFlipkart(9, 2, { emptyBefore: [0, 2] })
    const adapter = new FlipkartAdapter()
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(10)
      const params = withPageSink({ page, limit: 4 } as QueryParams)
      const rows = await adapter.listInventoryLevels(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(ids)
    const details = calls.filter((c) => c.path === '/listings/v3/details')
    expect(details.every((c) => (c.body['sku_ids'] as string[]).length > 0)).toBe(true)
  })

  it('two connections never share a walk: page 2 under token B serves the rows of B', async () => {
    const L = 4
    const a = makeServer(3 * L, 2, { prefix: 'AAA' })
    const b = makeServer(3 * L, 2, { prefix: 'BBB' })
    fakeSellers({ 'token-a': a, 'token-b': b })
    const adapter = new FlipkartAdapter()
    const pa = withPageSink({ page: 1, limit: L } as QueryParams)
    const ra = await adapter.listInventoryLevels({ accessToken: 'token-a' }, pa)
    expect(ra.map((r) => r.id)).toEqual(a.ids.slice(0, L))
    const pb = withPageSink({ page: 2, limit: L } as QueryParams)
    const rb = await adapter.listInventoryLevels({ accessToken: 'token-b' }, pb)
    expect(rb.map((r) => r.id)).toEqual(b.ids.slice(L, 2 * L))
    expect(b.calls.length).toBeGreaterThan(0)
  })

  it('a skuIds-filtered walk and an unfiltered walk do not share a walk', async () => {
    const L = 3
    const { listings, ids } = fakeFlipkart(30, 4)
    const adapter = new FlipkartAdapter()
    const chosen = listings.filter((l) => l.locations.length > 0).slice(-6)
    const expected = chosen.flatMap((l) => l.locations.map((loc) => `${l.sku_id}:${loc.id}`))
    const skuIds = chosen.map((l) => l.sku_id).join(',')

    const u1 = withPageSink({ page: 1, limit: L } as QueryParams)
    expect((await adapter.listInventoryLevels(CREDS, u1)).map((r) => r.id)).toEqual(ids.slice(0, L))
    const f2 = withPageSink({ page: 2, limit: L, skuIds } as QueryParams)
    expect((await adapter.listInventoryLevels(CREDS, f2)).map((r) => r.id)).toEqual(
      expected.slice(L, 2 * L),
    )
    const u2 = withPageSink({ page: 2, limit: L } as QueryParams)
    expect((await adapter.listInventoryLevels(CREDS, u2)).map((r) => r.id)).toEqual(
      ids.slice(L, 2 * L),
    )
  })
})
