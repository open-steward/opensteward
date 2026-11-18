/**
 * The five Megaventory operations this adapter lists from do not paginate, so
 * every list method pages locally. (Megaventory paginates some operations,
 * BatchNumberGet and SerialNumberGet among them, but none of these five.)
 *
 * Each of the five Get operations documents the same request fields and none
 * of them positions a page: `Filters`, `ReturnTopNRecords`, `APIKEY` and a few
 * entity filters, no page, offset, skip or cursor. `ReturnTopNRecords` is a
 * top-N limiter, not a page size:
 *
 *   "Optionally, you can use ReturnTopNRecords to limit the number of the
 *   results to the specified number (omit, or add ReturnTopNRecords = -1 to
 *   get all the available results). The ReturnTopNRecords chooses the top
 *   records in a ProductID descending order."
 *   https://api.megaventory.com/v2017a/json/metadata?op=ProductGet
 *   (the same sentence appears on InventoryLocationStockGet,
 *   InventoryLocationGet, SupplierClientGet and PurchaseOrderGet, each naming
 *   its own id)
 *
 * The adapter used to send `ReturnTopNRecords = limit` and drop `page`, so
 * page 2 returned page 1's rows and no row past the first page was ever
 * reachable. Each method now asks for every record (`-1`) and slices the
 * caller's page from them.
 *
 * The fake upstream below is mounted at axios, like the client test's, and
 * honours only what the metadata documents: `Filters` (Equals) and
 * `ReturnTopNRecords`, over rows ordered by id descending. It ignores anything
 * else, so an adapter that invented a page parameter would still see page 1.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { InventoryAdapter } from '../../../../../../src/verticals/inventory/adapter/interface'
import { MegaventoryAdapter } from '../../../../../../src/verticals/inventory/adapters/megaventory/index'

type Row = Record<string, unknown>
type Body = Record<string, unknown> & {
  Filters?: Array<{ FieldName: string; SearchOperator: string; SearchValue: unknown }>
  ReturnTopNRecords?: number
}

const creds = { accessToken: 'the-key' } as Credentials

/** Every request the fake upstream received, in order. */
const requests: Array<{ op: string; body: Body }> = []
/** Rows per operation, and the id field each operation orders by. */
let tables: Record<string, { key: string; idField: string; rows: Row[] }> = {}
/**
 * Applied to each response before it is sent, with the 1-based request
 * number: for orders the metadata leaves undocumented, which the upstream is
 * free to vary between calls.
 */
let reshape: ((rows: Row[], request: number) => Row[]) | undefined

/** The upstream, answering only the documented request fields. */
async function post(path: string, body: Body) {
  const op = path.replace(/^\//, '')
  requests.push({ op, body })
  const table = tables[op]
  if (!table) throw new Error(`fake upstream has no operation ${op}`)
  let rows = table.rows.filter((r) =>
    (body.Filters ?? []).every((f) => {
      if (f.SearchOperator !== 'Equals') {
        throw new Error(`fake upstream only models Equals, got ${f.SearchOperator}`)
      }
      return String(r[f.FieldName]) === String(f.SearchValue)
    }),
  )
  // "chooses the top records in a <Entity>ID descending order"
  rows = [...rows].sort((a, b) => Number(b[table.idField]) - Number(a[table.idField]))
  // "omit, or add ReturnTopNRecords = -1 to get all the available results"
  const top = body.ReturnTopNRecords
  if (typeof top === 'number' && top > 0) rows = rows.slice(0, top)
  if (reshape) rows = reshape(rows, requests.length)
  return { status: 200, data: { [table.key]: rows, ResponseStatus: { ErrorCode: '0' } } }
}

beforeEach(() => {
  requests.length = 0
  tables = {}
  reshape = undefined
  vi.spyOn(axios, 'create').mockReturnValue({ post } as unknown as ReturnType<typeof axios.create>)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

interface Case {
  method: string
  op: string
  /** Seed the upstream so the method's canonical list has exactly `n` rows. */
  seed: (n: number) => void
  /** The canonical ids of those `n` rows, in the upstream's documented order. */
  expected: (n: number) => string[]
  call: (a: MegaventoryAdapter, params: QueryParams) => Promise<Array<{ id: string }>>
}

/**
 * One stock row per (product, location). Every product is held at two
 * locations except the lowest id, which takes the remainder, so the rows the
 * caller pages over are not the products `ReturnTopNRecords` would count.
 */
function stockProducts(n: number): Array<{ productID: number; locations: number[] }> {
  const products = Math.ceil(n / 2)
  return range(products).map((p) => ({
    productID: p,
    locations: p === 1 && n % 2 === 1 ? [1] : [1, 2],
  }))
}

const CASES: Case[] = [
  {
    method: 'listProducts',
    op: 'ProductGet',
    seed: (n) => {
      tables['ProductGet'] = {
        key: 'mvProducts',
        idField: 'ProductID',
        rows: range(n).map((i) => ({
          ProductID: i,
          ProductSKU: `SKU-${i}`,
          ProductDescription: `P${i}`,
        })),
      }
    },
    expected: (n) => range(n).reverse().map(String),
    call: (a, p) => a.listProducts(creds, p),
  },
  {
    method: 'listStockLevels',
    op: 'InventoryLocationStockGet',
    seed: (n) => {
      tables['InventoryLocationStockGet'] = {
        key: 'mvProductStockList',
        idField: 'productID',
        rows: stockProducts(n).map((p) => ({
          productID: p.productID,
          mvStock: p.locations.map((l) => ({
            InventoryLocationID: l,
            StockOnHand: 5,
            StockOnHold: 1,
          })),
        })),
      }
    },
    expected: (n) =>
      stockProducts(n)
        .reverse()
        .flatMap((p) => p.locations.map((l) => `${p.productID}:${l}`)),
    call: (a, p) => a.listStockLevels(creds, p),
  },
  {
    method: 'listLocations',
    op: 'InventoryLocationGet',
    seed: (n) => {
      tables['InventoryLocationGet'] = {
        key: 'mvInventoryLocations',
        idField: 'InventoryLocationID',
        rows: range(n).map((i) => ({ InventoryLocationID: i, InventoryLocationName: `L${i}` })),
      }
    },
    expected: (n) => range(n).reverse().map(String),
    call: (a, p) => a.listLocations(creds, p),
  },
  {
    method: 'listSuppliers',
    op: 'SupplierClientGet',
    // Suppliers and customers interleaved: the upstream filter is what keeps
    // the customers out, so the local total must be the supplier count.
    seed: (n) => {
      tables['SupplierClientGet'] = {
        key: 'mvSupplierClients',
        idField: 'SupplierClientID',
        rows: range(2 * n).map((i) => ({
          SupplierClientID: i,
          SupplierClientType: i % 2 === 0 ? 'Supplier' : 'Client',
          SupplierClientName: `S${i}`,
        })),
      }
    },
    expected: (n) =>
      range(n)
        .reverse()
        .map((i) => String(2 * i)),
    call: (a, p) => a.listSuppliers(creds, p),
  },
  {
    method: 'listPurchaseOrders',
    op: 'PurchaseOrderGet',
    seed: (n) => {
      tables['PurchaseOrderGet'] = {
        key: 'mvPurchaseOrders',
        idField: 'PurchaseOrderId',
        rows: range(n).map((i) => ({
          PurchaseOrderId: i,
          PurchaseOrderNo: `PO-${i}`,
          PurchaseOrderStatus: 'Pending',
          PurchaseOrderSupplierID: 9,
          PurchaseOrderDetails: [],
        })),
      }
    },
    expected: (n) => range(n).reverse().map(String),
    call: (a, p) => a.listPurchaseOrders(creds, p),
  },
]

/** Params exactly as the inventory router builds them for this adapter. */
function routerParams(query: Record<string, string>, adapter: InventoryAdapter): QueryParams {
  return parseListQuery(query, adapter)
}

/** Drive a method the way the sync worker does: one page sink per page. */
async function drive(c: Case, limit: number, pages: number) {
  const adapter = new MegaventoryAdapter()
  const ids: string[] = []
  const lengths: number[] = []
  const hasMore: Array<boolean | undefined> = []
  const totals: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await c.call(adapter, params)
    ids.push(...rows.map((r) => r.id))
    lengths.push(rows.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
    totals.push(readUpstreamPage(params)?.totalCount)
  }
  return { ids, lengths, hasMore, totals }
}

/**
 * Page the API route the way a client does: `parseListQuery` and `listPage`,
 * from page 1 until `meta.hasMore` is not true (at most `maxPages`).
 */
async function driveApi(c: Case, limit: string, maxPages: number) {
  const adapter = new MegaventoryAdapter()
  const ids: string[] = []
  const metas: Array<{ limit: number; hasMore: boolean | null; totalCount: number | null }> = []
  const lengths: number[] = []
  for (let page = 1; page <= maxPages; page++) {
    const params = routerParams({ limit, page: String(page) }, adapter)
    const env = listPage(await c.call(adapter, params), params, 'megaventory')
    ids.push(...env.data.map((r) => r.id))
    lengths.push(env.data.length)
    metas.push({
      limit: env.meta.limit,
      hasMore: env.meta.hasMore,
      totalCount: env.meta.totalCount,
    })
    if (env.meta.hasMore !== true) break
  }
  return { ids, lengths, metas }
}

describe.each(CASES)('megaventory $method pages locally', (c) => {
  const L = 3

  it('serves N = 2L + 1 rows once each across three pages, ending on the third', async () => {
    const N = 2 * L + 1
    c.seed(N)
    const { ids, hasMore, totals } = await drive(c, L, 3)
    expect(ids).toEqual(c.expected(N))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([N, N, N])
  })

  it('asks page 2 for every record, not the top L', async () => {
    c.seed(2 * L + 1)
    await drive(c, L, 2)
    const page2 = requests[1]!
    expect(page2.op).toBe(c.op)
    expect(page2.body.ReturnTopNRecords).toBe(-1)
    expect(page2.body.APIKEY).toBe('the-key')
    // Nothing undocumented rides along pretending to page.
    for (const key of Object.keys(page2.body)) {
      expect(['APIKEY', 'ReturnTopNRecords', 'Filters']).toContain(key)
    }
  })

  it('ends on page 2 when N = 2L, although that page is full', async () => {
    const N = 2 * L
    c.seed(N)
    const { ids, hasMore } = await drive(c, L, 2)
    expect(ids).toEqual(c.expected(N))
    expect(hasMore).toEqual([true, false])
  })

  it('serves a collection larger than the sync page (limit 500) across pages', async () => {
    // No ReturnTopNRecords ceiling is documented, so there is no max to clamp
    // to; the size that matters is the worker's own 500-row page.
    const N = 2 * 500 + 1
    c.seed(N)
    const { ids, lengths, hasMore } = await drive(c, 500, 3)
    expect(ids).toEqual(c.expected(N))
    // Each page is exactly the size asked for: a page cut at some other size
    // and strided by it would still cover every row here, but not on the API.
    expect(lengths).toEqual([500, 500, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves every row once on the API path at the maximum router limit', async () => {
    // 1300 is not a multiple of 500. A page cut shorter than asked and strided
    // by its own size would end the API walk rows early, because meta.hasMore
    // is judged as page × meta.limit < totalCount.
    const N = 1300
    c.seed(N)
    const { ids, lengths, metas } = await driveApi(c, '500', 5)
    expect(ids).toEqual(c.expected(N))
    expect(lengths).toEqual([500, 500, 300])
    expect(metas).toEqual([
      { limit: 500, hasMore: true, totalCount: N },
      { limit: 500, hasMore: true, totalCount: N },
      { limit: 500, hasMore: false, totalCount: N },
    ])
  })

  it('serves everything on page 1 when the limit exceeds the collection', async () => {
    const N = 2 * L + 1
    c.seed(N)
    const { ids, hasMore } = await drive(c, 5000, 1)
    expect(ids).toEqual(c.expected(N))
    expect(hasMore).toEqual([false])
  })

  it('pages at the limit parseListQuery delivers', async () => {
    const N = 2 * L + 1
    c.seed(N)
    const adapter = new MegaventoryAdapter()
    const params = routerParams({ limit: String(L), page: '2' }, adapter)
    const rows = await c.call(adapter, params)
    expect(rows.map((r) => r.id)).toEqual(c.expected(N).slice(L, 2 * L))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, totalCount: N })
  })

  it('publishes an exact meta.hasMore on the API path', async () => {
    const N = 2 * L
    c.seed(N)
    const adapter = new MegaventoryAdapter()

    const p1 = routerParams({ limit: String(L) }, adapter)
    const env1 = listPage(await c.call(adapter, p1), p1, 'megaventory')
    expect(env1.data.map((r) => r.id)).toEqual(c.expected(N).slice(0, L))
    expect(env1.meta).toMatchObject({ page: 1, limit: L, hasMore: true, totalCount: N })

    // A full last page: a short-page guess would say null here.
    const p2 = routerParams({ limit: String(L), page: '2' }, adapter)
    const env2 = listPage(await c.call(adapter, p2), p2, 'megaventory')
    expect(env2.data.map((r) => r.id)).toEqual(c.expected(N).slice(L))
    expect(env2.meta).toMatchObject({ page: 2, limit: L, hasMore: false, totalCount: N })
  })
})

describe('megaventory listStockLevels slices a stable order', () => {
  const stock = CASES.find((c) => c.method === 'listStockLevels')!

  it('serves every row once when the upstream reorders the locations of a product between calls', async () => {
    // The metadata documents the product order (ProductId descending) but not
    // the order of a product's mvStock entries; its example happens to list
    // locations 4 then 5. Every page is a fresh fetch, and a page boundary can
    // fall inside one product's locations, so the slice must not depend on it.
    const L = 3
    const N = 2 * L + 1
    stock.seed(N)
    // Every second response lists each product's locations the other way round.
    reshape = (rows, request) =>
      request % 2 === 0
        ? rows.map((r) => ({ ...r, mvStock: [...(r['mvStock'] as Row[])].reverse() }))
        : rows
    const { ids, hasMore } = await drive(stock, L, 3)
    expect(requests).toHaveLength(3)
    // Product descending, then location ascending, whatever order each call sent.
    expect(ids).toEqual(stock.expected(N))
    expect(new Set(ids).size).toBe(N)
    expect(hasMore).toEqual([true, true, false])
  })

  it('orders the locations of each product ascending when every call lists them descending', async () => {
    const L = 3
    const N = 2 * L
    stock.seed(N)
    reshape = (rows) => rows.map((r) => ({ ...r, mvStock: [...(r['mvStock'] as Row[])].reverse() }))
    const { ids } = await drive(stock, L, 2)
    expect(ids).toEqual(stock.expected(N))
  })
})
