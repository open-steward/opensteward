/**
 * Wix paging: 1-based `page` + caller's `limit` → the documented
 * `query.paging.{limit, offset}` of Wix's POST query endpoints.
 *
 * Query Products (catalog-v1/catalog/query-products.md):
 *   "Returns a list of up to 100 products, given the provided paging, sorting
 *    and filtering. ... name: offset | type: integer | description: Number of
 *    items to skip in the display (relevant for all pages after the first) ...
 *    name: totalResults | type: integer"
 * Query Collections (catalog-v1/catalog/query-collections.md):
 *   "Retrieves a list of up to 100 collections, ... name: totalResults |
 *    type: integer | description: Total number of results returned."
 * Query Inventory (catalog-v1/inventory/query-inventory.md):
 *   "name: limit | type: integer | description: Amount of items to load per
 *    page ... validation: minimum 0, maximum 100 ... name: totalResults"
 * Query Contacts (contacts/contact-v4/query-contacts.md):
 *   "Up to 1,000 contacts can be returned per request. ... name: offset ...
 *    Number of items to skip in the current sort order. ... name: total |
 *    type: integer | description: The total number of items that match the
 *    query."
 *
 * Before this fix every query was sent with `offset: 0`, so page 2 repeated
 * page 1. Inventory items flatten into one InventoryLevel per variant, so one
 * upstream page is not one caller page there: it goes through pageByRows.
 *
 * listOrders and listDiscounts are out of scope (their paths need a rebuild)
 * and are not covered here.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  effectivePageSize,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'
import { WixAdapter } from '../../../../../../src/verticals/ecommerce/adapters/wix/index'

const CREDS = { accessToken: 'wix_test', refreshToken: 'wix_refresh' }
/** "Returns a list of up to 100 products" / inventory "maximum 100". */
const STORES_MAX = 100
/** "Up to 1,000 contacts can be returned per request." */
const CONTACTS_MAX = 1000
/** The adapter clamps every Wix query to its MAX_PAGE_SIZE. */
const ADAPTER_MAX = 100

type Kind = 'products' | 'collections' | 'contacts' | 'inventoryItems'

const PATHS: Record<string, Kind> = {
  '/stores/v1/products/query': 'products',
  '/stores/v1/collections/query': 'collections',
  '/contacts/v4/contacts/query': 'contacts',
  '/stores/v2/inventoryItems/query': 'inventoryItems',
}

interface Sent {
  path: string
  limit: number
  offset: number
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(msg), { status: 400 })
}

/**
 * A fake Wix that honours ONLY the documented `query.paging.limit` and
 * `query.paging.offset`. Anything else in `query` (such as `cursorPaging`), any
 * other top-level body key, or a limit outside the documented range is refused
 * with a 400 rather than silently ignored.
 *
 * `inventoryVariants[i]` is the number of variants of inventory item i (0 means
 * the adapter synthesises one row for the item itself).
 */
function fakeWix(opts: {
  rows?: number
  inventoryVariants?: number[]
  /** Prefix for inventory ids, so two connections' rows can be told apart. */
  idPrefix?: string
  /** Leave `totalResults` out of inventory responses. */
  omitTotal?: boolean
  /** Serve at most this many inventory items per request, even below the limit. */
  serveAtMost?: number
}) {
  const n = opts.rows ?? 0
  const sent: Sent[] = []
  const post = vi.fn(async (path: string, body: unknown) => {
    const kind = PATHS[path]
    if (!kind) throw Object.assign(new Error(`unexpected ${path}`), { status: 404 })
    const b = (body ?? {}) as Record<string, unknown>
    const extra = Object.keys(b).filter((k) => k !== 'query')
    if (extra.length > 0) throw badRequest(`unknown body keys: ${extra.join(',')}`)
    const query = (b['query'] ?? {}) as Record<string, unknown>
    const unknownQ = Object.keys(query).filter((k) => k !== 'paging')
    if (unknownQ.length > 0) throw badRequest(`unknown query keys: ${unknownQ.join(',')}`)
    const paging = (query['paging'] ?? {}) as Record<string, unknown>
    const unknownP = Object.keys(paging).filter((k) => k !== 'limit' && k !== 'offset')
    if (unknownP.length > 0) throw badRequest(`unknown paging keys: ${unknownP.join(',')}`)
    const max = kind === 'contacts' ? CONTACTS_MAX : STORES_MAX
    const limit = paging['limit'] === undefined ? 50 : paging['limit']
    const offset = paging['offset'] === undefined ? 0 : paging['offset']
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0 || limit > max) {
      throw badRequest(`limit out of range: ${String(limit)}`)
    }
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
      throw badRequest(`offset out of range: ${String(offset)}`)
    }
    sent.push({ path, limit, offset })

    if (kind === 'inventoryItems') {
      const counts = opts.inventoryVariants ?? []
      const pre = opts.idPrefix ?? ''
      const all = counts.map((c, i) => ({
        id: `${pre}inv${i + 1}`,
        productId: `p${i + 1}`,
        variants: Array.from({ length: c }, (_, j) => ({
          variantId: `${pre}v${i + 1}-${j + 1}`,
          inStock: true,
          quantity: j,
        })),
      }))
      const items = all.slice(offset, offset + Math.min(limit, opts.serveAtMost ?? limit))
      return {
        data: {
          inventoryItems: items,
          metadata: { items: items.length, offset },
          ...(opts.omitTotal ? {} : { totalResults: all.length }),
        },
      }
    }

    const all = Array.from({ length: n }, (_, i) => ({ id: String(i + 1), name: `r${i + 1}` }))
    const items = all.slice(offset, offset + limit)
    if (kind === 'contacts') {
      return {
        data: {
          contacts: items,
          pagingMetadata: { count: items.length, offset, total: n, tooManyToCount: false },
        },
      }
    }
    return {
      data: {
        [kind]: items,
        metadata: { items: items.length, offset },
        totalResults: n,
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ post } as unknown as ReturnType<typeof axios.create>)
  return { sent, post }
}

const adapter = () =>
  new WixAdapter({ clientId: 'id', clientSecret: 'secret', redirectUri: 'https://x.test/cb' })

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

type ListMethod = 'listProducts' | 'listCollections' | 'listCustomers'

const OFFSET_METHODS: { method: ListMethod; path: string }[] = [
  { method: 'listProducts', path: '/stores/v1/products/query' },
  { method: 'listCollections', path: '/stores/v1/collections/query' },
  { method: 'listCustomers', path: '/contacts/v4/contacts/query' },
]

async function callIds(method: ListMethod, params: QueryParams): Promise<string[]> {
  const rows = (await adapter()[method](CREDS, params)) as { id: string }[]
  return rows.map((r) => r.id)
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe.each(OFFSET_METHODS)('wix $method paging', ({ method, path }) => {
  it.each([10, 7])(
    'N = 2L + 1 rows driven like the sync (limit %i) serve every id once, in order, with exact hasMore',
    async (limit) => {
      const n = 2 * limit + 1
      fakeWix({ rows: n })
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const k of [1, 2, 3]) {
        const params = withPageSink({ page: k, limit })
        seen.push(...(await callIds(method, params)))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(ids(1, n))
      expect(hasMore).toEqual([true, true, false])
    },
  )

  it('N = 2L rows (a full last page) end on page 2 from the total, not a row-count guess', async () => {
    const limit = 10
    const { sent } = fakeWix({ rows: 2 * limit })
    const hasMore: (boolean | undefined)[] = []
    for (const k of [1, 2]) {
      const params = withPageSink({ page: k, limit })
      await callIds(method, params)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
    expect(sent).toHaveLength(2)
  })

  it('page 2 sends the documented query.paging.offset with the caller limit', async () => {
    const { sent } = fakeWix({ rows: 50 })
    const params = withPageSink({ page: 2, limit: 10 })
    const got = await callIds(method, params)
    expect(got).toEqual(ids(11, 10))
    expect(sent).toEqual([{ path, limit: 10, offset: 10 }])
    expect(readUpstreamPage(params)?.totalCount).toBe(50)
  })

  it('with no limit, sends the adapter default page size of 50', async () => {
    const { sent } = fakeWix({ rows: 120 })
    const got = await callIds(method, withPageSink({ page: 2 }))
    expect(got).toEqual(ids(51, 50))
    expect(sent).toEqual([{ path, limit: 50, offset: 50 }])
  })

  it('the API path ends exactly on a full last page (N = 2L) with the true totalCount', async () => {
    fakeWix({ rows: 20 })
    const a = adapter()
    const p2 = parseListQuery({ page: '2', limit: '10' }, a as EcommerceAdapter)
    const env2 = listPage((await a[method](CREDS, p2)) as { id: string }[], p2, 'wix')
    expect(env2.data.map((r) => r.id)).toEqual(ids(11, 10))
    expect(env2.meta.totalCount).toBe(20)
    expect(env2.meta.hasMore).toBe(false)
  })

  it('a limit above the maximum is clamped and still serves every row', async () => {
    const limit = 150
    const n = 2 * ADAPTER_MAX + 1
    const { sent } = fakeWix({ rows: n })
    const seen: string[] = []
    for (let k = 1; k <= 10; k++) {
      const params = withPageSink({ page: k, limit })
      const page = await callIds(method, params)
      expect(effectivePageSize(params, limit)).toBe(ADAPTER_MAX)
      seen.push(...page)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(1, n))
    expect(sent).toEqual([
      { path, limit: ADAPTER_MAX, offset: 0 },
      { path, limit: ADAPTER_MAX, offset: ADAPTER_MAX },
      { path, limit: ADAPTER_MAX, offset: 2 * ADAPTER_MAX },
    ])
  })

  it('the API path (parseListQuery then listPage) reports meta.hasMore', async () => {
    fakeWix({ rows: 25 })
    const a = adapter()
    const p2 = parseListQuery({ page: '2', limit: '10' }, a as EcommerceAdapter)
    const env2 = listPage((await a[method](CREDS, p2)) as { id: string }[], p2, 'wix')
    expect(env2.data.map((r) => r.id)).toEqual(ids(11, 10))
    expect(env2.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ page: '3', limit: '10' }, a as EcommerceAdapter)
    const env3 = listPage((await a[method](CREDS, p3)) as { id: string }[], p3, 'wix')
    expect(env3.data.map((r) => r.id)).toEqual(ids(21, 5))
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('wix listCustomers when Wix cannot count', () => {
  it('tooManyToCount falls back to a full page meaning there may be more', async () => {
    const post = vi.fn(async (_path: string, body: unknown) => {
      const paging = (body as { query: { paging: { limit: number; offset: number } } }).query.paging
      const count = paging.offset === 0 ? paging.limit : 3
      return {
        data: {
          contacts: Array.from({ length: count }, (_, i) => ({
            id: String(paging.offset + i + 1),
          })),
          pagingMetadata: { count, offset: paging.offset, total: 0, tooManyToCount: true },
        },
      }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ post } as unknown as ReturnType<
      typeof axios.create
    >)
    const p1 = withPageSink({ page: 1, limit: 10 })
    await adapter().listCustomers(CREDS, p1)
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    expect(readUpstreamPage(p1)?.totalCount).toBeUndefined()
    const p2 = withPageSink({ page: 2, limit: 10 })
    await adapter().listCustomers(CREDS, p2)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })
})

describe('wix listInventoryLevels paging (rows flattened from inventory items)', () => {
  /** Variant counts 0..3 cycling, so an item yields 1, 1, 2 or 3 rows. */
  function variantsFor(items: number): number[] {
    return Array.from({ length: items }, (_, i) => i % 4)
  }
  function rowIds(counts: number[]): string[] {
    const out: string[] = []
    counts.forEach((c, i) => {
      if (c === 0) out.push(`inv${i + 1}:default`)
      for (let j = 1; j <= c; j++) out.push(`v${i + 1}-${j}:default`)
    })
    return out
  }
  /** Items whose rows add up to exactly `rows`. */
  function countsForRows(rows: number): number[] {
    const counts: number[] = []
    let total = 0
    let i = 0
    while (total < rows) {
      const want = i % 4
      const give = Math.min(Math.max(want, 1), rows - total)
      counts.push(want === 0 && give === 1 ? 0 : give)
      total += give
      i++
    }
    return counts
  }

  async function inventoryIds(params: QueryParams): Promise<string[]> {
    return (await adapter().listInventoryLevels(CREDS, params)).map((r) => r.id)
  }

  it.each([10, 7])(
    'N = 2L + 1 rows driven like the sync (limit %i) serve every id once, in order, with exact hasMore',
    async (limit) => {
      const counts = countsForRows(2 * limit + 1)
      const all = rowIds(counts)
      expect(all).toHaveLength(2 * limit + 1)
      fakeWix({ inventoryVariants: counts })
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const k of [1, 2, 3]) {
        const params = withPageSink({ page: k, limit })
        seen.push(...(await inventoryIds(params)))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(all)
      expect(hasMore).toEqual([true, true, false])
    },
  )

  it('walks several upstream pages by the documented offset, each row once', async () => {
    const counts = variantsFor(250)
    const all = rowIds(counts)
    const { sent } = fakeWix({ inventoryVariants: counts })
    const limit = 40
    const seen: string[] = []
    for (let k = 1; k <= 100; k++) {
      const params = withPageSink({ page: k, limit })
      const page = await inventoryIds(params)
      expect(page.length).toBeLessThanOrEqual(limit)
      seen.push(...page)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(all)
    expect(sent.map((s) => s.offset)).toEqual([0, 100, 200])
    expect(sent.every((s) => s.limit === STORES_MAX)).toBe(true)
  })

  it('page 2 of a fresh walk sends the documented query.paging.offset', async () => {
    const counts = variantsFor(250)
    const all = rowIds(counts)
    const { sent } = fakeWix({ inventoryVariants: counts })
    // Rows 200..299 lie past the first upstream page of 100 items (150 rows).
    const got = await inventoryIds(withPageSink({ page: 3, limit: 100 }))
    expect(got).toEqual(all.slice(200, 300))
    expect(sent.some((s) => s.offset === STORES_MAX)).toBe(true)
  })

  it('a limit above the maximum still serves every row', async () => {
    const counts = variantsFor(250)
    const all = rowIds(counts)
    fakeWix({ inventoryVariants: counts })
    const limit = 150
    const seen: string[] = []
    for (let k = 1; k <= 10; k++) {
      const params = withPageSink({ page: k, limit })
      seen.push(...(await inventoryIds(params)))
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(all)
  })

  it('the API path (parseListQuery then listPage) reports meta.hasMore', async () => {
    const counts = countsForRows(25)
    const all = rowIds(counts)
    fakeWix({ inventoryVariants: counts })
    const a = adapter()
    const p2 = parseListQuery({ page: '2', limit: '10' }, a as EcommerceAdapter)
    const env2 = listPage(await a.listInventoryLevels(CREDS, p2), p2, 'wix')
    expect(env2.data.map((r) => r.id)).toEqual(all.slice(10, 20))
    expect(env2.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ page: '3', limit: '10' }, a as EcommerceAdapter)
    const env3 = listPage(await a.listInventoryLevels(CREDS, p3), p3, 'wix')
    expect(env3.data.map((r) => r.id)).toEqual(all.slice(20, 25))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('keeps each connection to its own walk: two tokens never share cached rows', async () => {
    const counts = variantsFor(250)
    fakeWix({ inventoryVariants: counts, idPrefix: 'a-' })
    const credsA = { accessToken: 'tokA', refreshToken: 'refreshA' }
    const credsB = { accessToken: 'tokB', refreshToken: 'refreshB' }
    const a1 = await adapter().listInventoryLevels(credsA, withPageSink({ page: 1, limit: 10 }))
    expect(a1.every((r) => r.id.startsWith('a-'))).toBe(true)

    fakeWix({ inventoryVariants: counts, idPrefix: 'b-' })
    const b2 = await adapter().listInventoryLevels(credsB, withPageSink({ page: 2, limit: 10 }))
    expect(b2.map((r) => r.id)).toEqual(
      rowIds(counts)
        .slice(10, 20)
        .map((id) => `b-${id}`),
    )
  })

  it('with no totalResults, a full upstream page means more and a short one ends the walk', async () => {
    const counts = variantsFor(150)
    const all = rowIds(counts)
    const { sent } = fakeWix({ inventoryVariants: counts, omitTotal: true })
    const seen: string[] = []
    let last: boolean | undefined
    for (let k = 1; k <= 10; k++) {
      const params = withPageSink({ page: k, limit: 100 })
      seen.push(...(await inventoryIds(params)))
      last = readUpstreamPage(params)?.hasMore
      if (last === false) break
    }
    expect(seen).toEqual(all)
    expect(last).toBe(false)
    expect(sent.map((s) => s.offset)).toEqual([0, 100])
  })

  it('a short upstream page advances the offset by the items actually served', async () => {
    const counts = variantsFor(150)
    const all = rowIds(counts)
    const { sent } = fakeWix({ inventoryVariants: counts, serveAtMost: 60 })
    const seen: string[] = []
    for (let k = 1; k <= 20; k++) {
      const params = withPageSink({ page: k, limit: 40 })
      seen.push(...(await inventoryIds(params)))
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(all)
    expect(sent.map((s) => s.offset)).toEqual([0, 60, 120])
  })

  it('an empty upstream page ends the walk even when the total says more', async () => {
    const post = vi.fn(async () => ({
      data: { inventoryItems: [], metadata: { items: 0, offset: 0 }, totalResults: 5 },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ post } as unknown as ReturnType<
      typeof axios.create
    >)
    const params = withPageSink({ page: 1, limit: 10 })
    await expect(adapter().listInventoryLevels(CREDS, params)).resolves.toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('with no limit, serves the adapter default of 50 rows', async () => {
    const counts = variantsFor(250)
    const all = rowIds(counts)
    fakeWix({ inventoryVariants: counts })
    expect(await inventoryIds(withPageSink({ page: 2 }))).toEqual(all.slice(50, 100))
  })
})
