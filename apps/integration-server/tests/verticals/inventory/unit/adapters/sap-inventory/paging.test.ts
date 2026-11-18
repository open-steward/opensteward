/**
 * SAP has no storage-location list in its inventory APIs, so listLocations
 * derives Location records from the stock table:
 * GET /sap/opu/odata/sap/API_MATERIAL_STOCK_SRV/A_MatlStkInAcctMod. It emits one
 * record per distinct Plant and one per distinct Plant:StorageLocation. That
 * entity set is keyed by Material, Plant, StorageLocation, Batch and more
 * (SAP's own VDM, @sap/cloud-sdk-vdm-material-stock-service), so
 * `$select=Plant,StorageLocation` returns one row per stock record, not one per
 * location.
 *
 * The adapter used to send `$top=limit` with no `$skip`, so page 2 repeated
 * page 1. Its page was also `limit` stock rows deduplicated into anything up
 * to 2 × limit locations. Now it walks the stock rows sorted by
 * `$orderby=Plant,StorageLocation`, which keeps every location's rows
 * together, and starts each page after the first by `$filter` where the last
 * one ended: within the plant past the pair it ended on
 * (`Plant eq 'p' and StorageLocation gt 's'`), then past the plant
 * (`Plant gt 'p'`). The row pager cuts exactly the caller's locations out of
 * that stream.
 *
 * Query options, from SAP Gateway's "OData Query Options" page
 * (https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/30116c10d4ff42908d4a4ad023b77634.html):
 *   "$orderby Request example: .../Products?$orderby=Category desc"
 *   "$top Request example: .../Products?$top=5"
 *   "$filter Request example: .../Products?$filter=Category eq 'Notebooks'"
 *   "$select Request example: .../Products?$select=Category,Name"
 * and `gt` on strings from the OData V2 specification SAP's spec of this API
 * links for `$filter`
 * (https://help.sap.com/doc/5890d27be418427993fafa6722cdc03b/Cloud/en-US/OdataV2.pdf,
 * 2.2.3.6.1.1): `gt` operands may be "Edm.String", and "a data service MUST
 * always use consistent semantics when ordering and comparing values".
 * Server-driven paging ($skiptoken) answers with an OData v2 `d.__next` link.
 *
 * The fake SAP below honours those options and nothing else. It stores its
 * rows in key order (Material first), so one location's rows are spread across
 * the whole table until `$orderby` groups them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { SapInventoryAdapter } from '../../../../../../src/verticals/inventory/adapters/sap-inventory'
import type { InventoryAdapter } from '../../../../../../src/verticals/inventory/adapter/interface'

const TENANT = 'my300000-api.s4hana.ondemand.com'

/**
 * A connection: an access token minted for an OAuth client of a tenant. The
 * client decides which stock the connection may read; the token is replaced
 * every hour.
 */
function creds(token: string, clientId = 'client-a', tenantUrl = TENANT): Credentials {
  return {
    accessToken: token,
    extra: { tenantUrl, clientId, clientSecret: `secret-of-${clientId}` },
  }
}

const CREDS = creds('token-a')

/** Stock rows the adapter asks for per upstream page. It never follows the caller's limit. */
const UPSTREAM_TOP = 500

const BASE_QUERY = {
  $format: 'json',
  $select: 'Plant,StorageLocation',
  $orderby: 'Plant,StorageLocation',
  $top: UPSTREAM_TOP,
}

interface StockRow {
  Material: string
  Plant: string
  StorageLocation: string
  Batch: string
  InventoryStockType: string
  MatlWrhsStkQtyInMatlBaseUnit: string
}

interface Table {
  /** The locations, in the order the adapter serves them: by Plant, then StorageLocation. */
  ids: string[]
  /** The stock rows, in key order (Material first). */
  stock: StockRow[]
}

function stockRow(material: number, Plant: string, StorageLocation: string): StockRow {
  return {
    Material: `MAT-${String(material).padStart(6, '0')}`,
    Plant,
    StorageLocation,
    Batch: '',
    InventoryStockType: '01',
    MatlWrhsStkQtyInMatlBaseUnit: '5',
  }
}

/**
 * A stock table from explicit cells `[plant, storageLocation, materials]`,
 * listed in Plant, StorageLocation order. An empty storage location is stock
 * held at plant level: a plant, but no storage location.
 */
function cellsTable(cells: ReadonlyArray<readonly [string, string, number]>): Table {
  const ids: string[] = []
  for (const [plant, sloc] of cells) {
    if (plant && !ids.includes(plant)) ids.push(plant)
    if (plant && sloc) ids.push(`${plant}:${sloc}`)
  }
  const stock: StockRow[] = []
  const most = Math.max(...cells.map(([, , n]) => n))
  for (let m = 0; m < most; m++)
    for (const [plant, sloc, n] of cells) if (m < n) stock.push(stockRow(m, plant, sloc))
  return { ids, stock }
}

/**
 * A stock table that yields exactly `n` locations. Plants carry one to three
 * storage locations, and every other plant also holds stock at plant level
 * (an empty StorageLocation), which is a plant but no storage location. Each
 * cell holds `perCell` materials. Plant codes start at `firstPlant` and stay
 * four digits, so they sort as numbers do.
 */
function stockTable(n: number, perCell: number, firstPlant = 1000): Table {
  const ids: string[] = []
  const cells: Array<[string, string]> = []
  for (let p = 0; ids.length < n; p++) {
    const plant = String(firstPlant + p * 10)
    ids.push(plant)
    const slocs = Math.min(n - ids.length, (p % 3) + 1)
    if (slocs === 0 || p % 2 === 1) cells.push([plant, ''])
    for (let s = 1; s <= slocs; s++) {
      const sloc = String(s).padStart(4, '0')
      ids.push(`${plant}:${sloc}`)
      cells.push([plant, sloc])
    }
  }
  const stock: StockRow[] = []
  for (let m = 0; m < perCell; m++)
    for (const [Plant, StorageLocation] of cells) stock.push(stockRow(m, Plant, StorageLocation))
  return { ids, stock }
}

/** Plants holding stock only at plant level, `materials` rows each: every location is a plant. */
function plantLevelTable(plants: number, materials: number): Table {
  return cellsTable(
    Array.from({ length: plants }, (_, i) => [String(1000 + i * 10), '', materials] as const),
  )
}

interface Call {
  tenant: string
  token: string
  service: string
  path: string
  params: Record<string, unknown>
  /** Stock rows in the response. */
  rows: number
}

interface FakeOptions {
  /** Server-driven paging: at most this many rows per response, with `d.__next` while more remain. */
  maxRows?: number
  /** A service that does not implement `$orderby` and answers in key order. */
  ignoreOrderby?: boolean
  /** A service that sorts by this instead of the `$orderby` it was sent. */
  sortsBy?: string
  /** A service that does not implement `$filter` and answers every row. */
  ignoreFilter?: boolean
  /** A service that applies this filter instead of the one it was sent. */
  appliesFilter?: (sent: string) => string
  /** Answer every request with this body instead of OData JSON. */
  body?: unknown
  /** Runs before request `n` (1-based) is answered: the stock changing during a walk. */
  beforeRequest?: (n: number) => void
}

const DOCUMENTED = new Set(['$format', '$select', '$orderby', '$top', '$skip', '$filter'])

function compare(a: StockRow, b: StockRow, orderby: string): number {
  for (const term of orderby.split(',')) {
    const [prop, dir] = term.trim().split(/\s+/)
    const x = String(a[prop as keyof StockRow] ?? '')
    const y = String(b[prop as keyof StockRow] ?? '')
    if (x !== y) return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1)
  }
  return 0
}

/** The `$filter` terms this fake understands: `Prop eq|gt|ge 'v'`, joined by `and`. */
function matcher(filter: string): (row: StockRow) => boolean {
  const terms = filter.split(' and ').map((term) => {
    const m = /^(Plant|StorageLocation) (eq|gt|ge) '((?:[^']|'')*)'$/.exec(term)
    if (!m) throw new Error(`unsupported $filter term ${term}`)
    return { prop: m[1] as 'Plant' | 'StorageLocation', op: m[2], value: m[3]!.replace(/''/g, "'") }
  })
  return (row) =>
    terms.every(({ prop, op, value }) =>
      op === 'eq' ? row[prop] === value : op === 'ge' ? row[prop] >= value : row[prop] > value,
    )
}

/**
 * A fake SAP: one stock table per tenant and access token (`<tenant>/<token>`,
 * or the token alone), so two connections can see different rows.
 */
function fakeSap(tables: Record<string, Table>, opts: FakeOptions = {}): Call[] {
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg: {
    baseURL: string
    headers: Record<string, string>
  }) => {
    const token = String(cfg.headers['Authorization'] ?? '').replace(/^Bearer /, '')
    const [, tenant = '', service = ''] =
      /^https:\/\/([^/]+)\/sap\/opu\/odata\/sap\/(.+)$/.exec(cfg.baseURL) ?? []
    const get = vi.fn(async (path: string, reqCfg?: { params?: Record<string, unknown> }) => {
      const params = { ...reqCfg?.params }
      const call: Call = { tenant, token, service, path, params, rows: 0 }
      calls.push(call)
      opts.beforeRequest?.(calls.length)
      if (service !== 'API_MATERIAL_STOCK_SRV' || path !== '/A_MatlStkInAcctMod')
        throw new Error(`unexpected request ${service}${path}`)
      for (const k of Object.keys(params))
        if (!DOCUMENTED.has(k)) throw new Error(`undocumented query option ${k}`)
      if (opts.body !== undefined) return { data: opts.body }
      const table = tables[`${tenant}/${token}`] ?? tables[token]
      if (!table) throw Object.assign(new Error('401'), { response: { status: 401 } })
      const filter = params['$filter']
      let rows = [...table.stock]
      if (typeof filter === 'string' && !opts.ignoreFilter)
        rows = rows.filter(matcher(opts.appliesFilter?.(filter) ?? filter))
      const orderby = params['$orderby']
      if (typeof orderby === 'string' && !opts.ignoreOrderby)
        rows.sort((a, b) => compare(a, b, opts.sortsBy ?? orderby))
      const skip = params['$skip'] === undefined ? 0 : Number(params['$skip'])
      const top = params['$top'] === undefined ? rows.length : Number(params['$top'])
      const size = Math.min(top, opts.maxRows ?? top)
      const page = rows.slice(skip, skip + size)
      call.rows = page.length
      const select = params['$select']
      const results =
        typeof select === 'string'
          ? page.map((r) =>
              Object.fromEntries(select.split(',').map((f) => [f, r[f as keyof StockRow]])),
            )
          : page
      const more = size < top && skip + size < rows.length
      return {
        data: {
          d: {
            results,
            ...(more
              ? {
                  __next: `https://${tenant}/sap/opu/odata/sap/API_MATERIAL_STOCK_SRV/A_MatlStkInAcctMod?$skiptoken=${skip + size}`,
                }
              : {}),
          },
        },
      }
    })
    return { get }
  }) as never)
  return calls
}

/** The `$filter` of each request, undefined for the first page of a walk. */
function filters(calls: readonly Call[]): Array<unknown> {
  return calls.map((c) => c.params['$filter'])
}

/** The router's parse, with the adapter typed as the router holds it. */
function parse(query: Record<string, string>): QueryParams {
  const routed: InventoryAdapter = new SapInventoryAdapter()
  return parseListQuery(query, routed)
}

/** Page through listLocations the way the sync worker does, recording the requests each page made. */
async function drive(limit: number, pages: number, credentials = CREDS, calls?: Call[]) {
  const adapter = new SapInventoryAdapter()
  const seen: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const requestsPerPage: Call[][] = []
  for (let page = 1; page <= pages; page++) {
    const before = calls?.length ?? 0
    const params: QueryParams = withPageSink({ page, limit })
    const locs = await adapter.listLocations(credentials, params)
    expect(locs.length).toBeLessThanOrEqual(limit)
    seen.push(...locs.map((l) => l.id))
    const meta = readUpstreamPage(params)
    hasMore.push(meta?.hasMore)
    expect(meta?.pagedLocally).toBe(true)
    requestsPerPage.push(calls?.slice(before) ?? [])
  }
  return { seen, hasMore, requestsPerPage }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('SapInventoryAdapter.listLocations pages the locations it derives from stock', () => {
  it('serves 2L + 1 locations once each over three pages, ending on the third', async () => {
    const L = 3
    const table = stockTable(2 * L + 1, 180)
    // Five cells of 180 materials. Sorted: 1000:0001, 1010 (plant level),
    // 1010:0001, 1010:0002, 1020:0001.
    expect(table.stock).toHaveLength(900)
    const calls = fakeSap({ 'token-a': table })
    const { seen, hasMore, requestsPerPage } = await drive(L, 3, CREDS, calls)
    expect(seen).toEqual(table.ids)
    expect(hasMore).toEqual([true, true, false])

    // Page 1 reads the first 500 stock rows: four locations, the last of
    // them (1010:0001) cut off by the end of the page.
    expect(requestsPerPage[0]!.map((c) => c.params)).toEqual([BASE_QUERY])
    // Page 2 carries on past 1010:0001 instead of skipping 500 rows: the
    // rest of plant 1010, then the plants after it. Page 3 is inside what
    // page 2 read and needs no request at all.
    expect(requestsPerPage[1]!.map((c) => c.params)).toEqual([
      { ...BASE_QUERY, $filter: "Plant eq '1010' and StorageLocation gt '0001'" },
      { ...BASE_QUERY, $filter: "Plant gt '1010'" },
    ])
    expect(requestsPerPage[2]).toEqual([])
    expect(calls.every((c) => c.token === 'token-a')).toBe(true)
  })

  it('serves 2L + 1 locations at the sync worker page size of 500', async () => {
    const L = 500
    const table = stockTable(2 * L + 1, 2)
    const calls = fakeSap({ 'token-a': table })
    const { seen, hasMore } = await drive(L, 3, CREDS, calls)
    expect(seen).toEqual(table.ids)
    expect(hasMore).toEqual([true, true, false])
    // Small locations: every request reads a new page of stock, never the
    // same one twice, and the whole walk is bounded by two per location.
    expect(new Set(calls.map((c) => JSON.stringify(c.params))).size).toBe(calls.length)
    expect(calls.length).toBeLessThanOrEqual(2 * table.ids.length + 1)
    expect(calls.reduce((n, c) => n + c.rows, 0)).toBe(table.stock.length)
  })

  it('ends on page 2 when there are exactly 2L locations', async () => {
    const L = 4
    const table = stockTable(2 * L, 150)
    fakeSap({ 'token-a': table })
    const { seen, hasMore } = await drive(L, 3)
    expect(seen).toEqual(table.ids)
    expect(hasMore).toEqual([true, false, false])
  })

  it('ends exactly when the whole stock table fits one full upstream page', async () => {
    // 500 stock rows: the first page is full, so only an empty page past
    // 1020:0001, then an empty page past plant 1020, say the table has ended.
    const table = stockTable(7, 100)
    expect(table.stock).toHaveLength(UPSTREAM_TOP)
    const calls = fakeSap({ 'token-a': table })
    const { seen, hasMore } = await drive(3, 3, CREDS, calls)
    expect(seen).toEqual(table.ids)
    expect(hasMore).toEqual([true, true, false])
    expect(filters(calls)).toEqual([
      undefined,
      "Plant eq '1020' and StorageLocation gt '0001'",
      "Plant gt '1020'",
    ])
    expect(calls.map((c) => c.rows)).toEqual([500, 0, 0])
  })

  it('carries on to the next plant after a full page ends exactly where a plant does', async () => {
    // Plant 1000 fills the first page to the last row. Its continuation comes
    // back empty, and the walk must still move on to plant 1010.
    const table = cellsTable([
      ['1000', '', 250],
      ['1000', '0001', 250],
      ['1010', '', 10],
    ])
    expect(table.ids).toEqual(['1000', '1000:0001', '1010'])
    const calls = fakeSap({ 'token-a': table })
    const { seen, hasMore } = await drive(2, 2, CREDS, calls)
    expect(seen).toEqual(table.ids)
    expect(hasMore).toEqual([true, false])
    expect(filters(calls)).toEqual([
      undefined,
      "Plant eq '1000' and StorageLocation gt '0001'",
      "Plant gt '1000'",
    ])
    expect(calls.map((c) => c.rows)).toEqual([500, 0, 10])
  })

  it('skips the rest of a storage location that fills more than an upstream page', async () => {
    // 1,200 materials in one storage location between two others: one
    // location, and one request, however many rows it holds.
    const table = cellsTable([
      ['1000', '', 1],
      ['1000', '0001', 1200],
      ['1000', '0002', 1],
    ])
    const calls = fakeSap({ 'token-a': table })
    const { seen, hasMore } = await drive(2, 2, CREDS, calls)
    expect(seen).toEqual(['1000', '1000:0001', '1000:0002'])
    expect(hasMore).toEqual([true, false])
    expect(filters(calls)).toEqual([
      undefined,
      "Plant eq '1000' and StorageLocation gt '0001'",
      "Plant gt '1000'",
    ])
  })

  it('costs at most two requests per location, and knows the end within them', async () => {
    // The worst case: plants that hold stock only at plant level, a full
    // page each. Every plant is one location, one full page, then one empty
    // page past it, so a page of L locations and the look past it take
    // 2L + 1 requests.
    const L = 3
    const calls = fakeSap({ 'token-a': plantLevelTable(L, 500) })
    const { seen, hasMore, requestsPerPage } = await drive(L, 1, CREDS, calls)
    expect(seen).toEqual(['1000', '1010', '1020'])
    expect(hasMore).toEqual([false])
    expect(filters(requestsPerPage[0]!)).toEqual([
      undefined,
      "Plant eq '1000' and StorageLocation gt ''",
      "Plant gt '1000'",
      "Plant eq '1010' and StorageLocation gt ''",
      "Plant gt '1010'",
      "Plant eq '1020' and StorageLocation gt ''",
      "Plant gt '1020'",
    ])
  })

  it('finds the next location within the same bound when there is one', async () => {
    const L = 3
    const calls = fakeSap({ 'token-a': plantLevelTable(5, 500) })
    const { seen, hasMore, requestsPerPage } = await drive(L, 2, CREDS, calls)
    expect(seen).toEqual(['1000', '1010', '1020', '1030', '1040'])
    expect(hasMore).toEqual([true, false])
    expect(requestsPerPage[0]).toHaveLength(2 * L + 1)
    // Page 2 starts from the page that found 1030, not from the top.
    expect(filters(requestsPerPage[1]!)).toEqual([
      "Plant eq '1030' and StorageLocation gt ''",
      "Plant gt '1030'",
      "Plant eq '1040' and StorageLocation gt ''",
      "Plant gt '1040'",
    ])
  })

  it('reaches a page asked for out of order within the bound for every location before it', async () => {
    // An API caller jumping straight to page 3 of 1: nothing recorded yet,
    // so the walk starts at the top and needs locations 0 to 3.
    const calls = fakeSap({ 'token-a': plantLevelTable(5, 500) })
    const params = withPageSink({ page: 3, limit: 1 })
    const locs = await new SapInventoryAdapter().listLocations(CREDS, params)
    expect(locs.map((l) => l.id)).toEqual(['1020'])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pagedLocally: true })
    expect(calls).toHaveLength(7)
  })

  it('knows the end of a worst-case page at the sync worker size within its bound', async () => {
    // 500 plants of plant-level stock, answered one row at a time with
    // d.__next: each plant is a page that is not the end of its filter, then
    // an empty page past it. The sync's page of 500 needs 2 × 500 + 1
    // requests to know that it is the last.
    const table = cellsTable(
      Array.from({ length: 500 }, (_, i) => [String(1000 + i), '', 2] as const),
    )
    const calls = fakeSap({ 'token-a': table }, { maxRows: 1 })
    const params = withPageSink({ page: 1, limit: 500 })
    const locs = await new SapInventoryAdapter().listLocations(CREDS, params)
    expect(locs.map((l) => l.id)).toEqual(table.ids)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, pagedLocally: true })
    expect(calls).toHaveLength(1001)
  })

  it('serves every location at the largest limit the router lets through', async () => {
    // No maximum is documented for $top; the router caps any limit at 500,
    // and the upstream page stays 500 stock rows whatever the caller asks.
    const params1 = parse({ limit: '1000' })
    expect(params1.limit).toBe(500)
    const table = stockTable(601, 2)
    const calls = fakeSap({ 'token-a': table })
    const adapter = new SapInventoryAdapter()
    const page1 = await adapter.listLocations(CREDS, params1)
    expect(page1).toHaveLength(500)
    expect(readUpstreamPage(params1)).toMatchObject({ hasMore: true, pagedLocally: true })
    const params2 = parse({ limit: '1000', page: '2' })
    const page2 = await adapter.listLocations(CREDS, params2)
    expect(page2).toHaveLength(101)
    expect(readUpstreamPage(params2)).toMatchObject({ hasMore: false, pagedLocally: true })
    expect([...page1, ...page2].map((l) => l.id)).toEqual(table.ids)
    expect(new Set(calls.map((c) => c.params['$top']))).toEqual(new Set([UPSTREAM_TOP]))
  })

  it('serves every location to a caller asking for more than the router allows', async () => {
    const table = stockTable(601, 2)
    fakeSap({ 'token-a': table })
    const params = withPageSink({ page: 1, limit: 1000 })
    const locs = await new SapInventoryAdapter().listLocations(CREDS, params)
    expect(locs.map((l) => l.id)).toEqual(table.ids)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, pagedLocally: true })
  })

  it('serves 500 locations, as the other lists here do, to a caller that names no limit', async () => {
    const table = stockTable(601, 2)
    fakeSap({ 'token-a': table })
    const params = withPageSink({ page: 1 })
    const locs = await new SapInventoryAdapter().listLocations(CREDS, params)
    expect(locs.map((l) => l.id)).toEqual(table.ids.slice(0, 500))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pagedLocally: true })
  })

  it('pages at the limit parseListQuery delivers', async () => {
    const table = stockTable(7, 150)
    fakeSap({ 'token-a': table })
    const adapter = new SapInventoryAdapter()
    const seen: string[] = []
    for (const page of ['1', '2', '3', '4']) {
      const params = parse({ limit: '2', page })
      expect(params.limit).toBe(2)
      seen.push(...(await adapter.listLocations(CREDS, params)).map((l) => l.id))
    }
    expect(seen).toEqual(table.ids)
  })

  it('reports an exact hasMore on the API path', async () => {
    const table = stockTable(7, 180)
    fakeSap({ 'token-a': table })
    const adapter = new SapInventoryAdapter()
    const metas = []
    for (const page of ['1', '2', '3']) {
      const params = parse({ limit: '3', page })
      const env = listPage(await adapter.listLocations(CREDS, params), params, 'sap-inventory')
      metas.push({ ids: env.data.map((l) => l.id), hasMore: env.meta.hasMore })
    }
    expect(metas).toEqual([
      { ids: table.ids.slice(0, 3), hasMore: true },
      { ids: table.ids.slice(3, 6), hasMore: true },
      { ids: table.ids.slice(6), hasMore: false },
    ])
  })

  it('keeps going when the service pages the stock rows itself with d.__next', async () => {
    const L = 3
    const table = stockTable(2 * L + 1, 180)
    const calls = fakeSap({ 'token-a': table }, { maxRows: 200 })
    const { seen, hasMore } = await drive(L, 3, CREDS, calls)
    expect(seen).toEqual(table.ids)
    expect(hasMore).toEqual([true, true, false])
    // A short page with d.__next is not the end of its filter: the next
    // request starts past the pair it ended on (plant-level 1010, then
    // 1010:0002), as after a full page.
    expect(filters(calls)).toEqual([
      undefined,
      "Plant eq '1010' and StorageLocation gt ''",
      "Plant eq '1010' and StorageLocation gt '0002'",
      "Plant gt '1010'",
    ])
    expect(calls.map((c) => c.rows)).toEqual([200, 200, 0, 180])
  })

  it('needs one request per location even when the service returns one row at a time', async () => {
    const table = cellsTable([
      ['1000', '0001', 1100],
      ['1000', '0002', 1],
    ])
    const calls = fakeSap({ 'token-a': table }, { maxRows: 1 })
    const params = withPageSink({ page: 1, limit: 3 })
    const locs = await new SapInventoryAdapter().listLocations(CREDS, params)
    expect(locs.map((l) => l.id)).toEqual(['1000', '1000:0001', '1000:0002'])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, pagedLocally: true })
    expect(calls.map((c) => c.rows)).toEqual([1, 1, 0])
  })

  it('never serves one connection the locations another connection read', async () => {
    // Two OAuth clients of one tenant: two communication users, whose
    // authorizations can show them different stock.
    const a = stockTable(7, 180)
    const b = stockTable(7, 180, 5000)
    const calls = fakeSap({ 'token-a': a, 'token-b': b })
    const adapter = new SapInventoryAdapter()
    // Connection A reads page 1 and leaves its upstream page in the row pager.
    await adapter.listLocations(creds('token-a', 'client-a'), withPageSink({ page: 1, limit: 3 }))
    const before = calls.length
    // Connection B on the same tenant asks for page 2 straight away.
    const params = withPageSink({ page: 2, limit: 3 })
    const locs = await adapter.listLocations(creds('token-b', 'client-b'), params)
    expect(locs.map((l) => l.id)).toEqual(b.ids.slice(3, 6))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    const bCalls = calls.slice(before)
    expect(bCalls.length).toBeGreaterThan(0)
    expect(bCalls.every((c) => c.token === 'token-b')).toBe(true)
  })

  it('never serves one tenant the locations another tenant read', async () => {
    const other = 'my400000-api.s4hana.ondemand.com'
    const a = stockTable(7, 180)
    const b = stockTable(7, 180, 5000)
    const calls = fakeSap({ [`${TENANT}/token-a`]: a, [`${other}/token-a`]: b })
    const adapter = new SapInventoryAdapter()
    await adapter.listLocations(creds('token-a'), withPageSink({ page: 1, limit: 3 }))
    const before = calls.length
    const params = withPageSink({ page: 2, limit: 3 })
    const locs = await adapter.listLocations(creds('token-a', 'client-a', other), params)
    expect(locs.map((l) => l.id)).toEqual(b.ids.slice(3, 6))
    expect(calls.slice(before).every((c) => c.tenant === other)).toBe(true)
  })

  it('carries a walk across an access-token refresh instead of starting it again', async () => {
    // Client credentials have no refresh token; auth.ts mints a new access
    // token for the same client every hour. Same client, same stock.
    const table = stockTable(7, 180)
    const calls = fakeSap({ 'token-a': table, 'token-a-refreshed': table })
    const adapter = new SapInventoryAdapter()
    const seen: string[] = []
    const p1 = await adapter.listLocations(creds('token-a'), withPageSink({ page: 1, limit: 3 }))
    seen.push(...p1.map((l) => l.id))
    const before = calls.length
    const p2 = await adapter.listLocations(
      creds('token-a-refreshed'),
      withPageSink({ page: 2, limit: 3 }),
    )
    seen.push(...p2.map((l) => l.id))
    expect(seen).toEqual(table.ids.slice(0, 6))
    const after = calls.slice(before)
    expect(after.length).toBeGreaterThan(0)
    // No request from the top of the table: the walk carried on.
    expect(filters(after).every((f) => typeof f === 'string')).toBe(true)
    expect(after.every((c) => c.token === 'token-a-refreshed')).toBe(true)
  })

  it('shares its positions between walks at different page sizes', async () => {
    // The key leaves the caller's limit out: an API walk at one limit
    // carries on from where a sync walk at another left off.
    const table = stockTable(7, 180)
    const calls = fakeSap({ 'token-a': table })
    await drive(3, 2, CREDS, calls)
    const before = calls.length
    const params = withPageSink({ page: 3, limit: 2 })
    const locs = await new SapInventoryAdapter().listLocations(CREDS, params)
    expect(locs.map((l) => l.id)).toEqual(table.ids.slice(4, 6))
    expect(filters(calls.slice(before)).every((f) => typeof f === 'string')).toBe(true)
  })

  it('serves every location once while stock moves during the walk', async () => {
    // Six plants, each with plant-level stock and two storage locations, 300
    // materials a cell. After the second request, 700 materials are stocked
    // at 1000:0001 and 100 leave 1000:0002, both behind the walk.
    const cells: Array<[string, string, number]> = []
    for (let p = 0; p < 6; p++)
      for (const s of ['', '0001', '0002']) cells.push([String(1000 + p), s, 300])
    const table = cellsTable(cells)
    expect(table.ids).toHaveLength(18)
    const calls = fakeSap(
      { 'token-a': table },
      {
        beforeRequest: (n) => {
          if (n !== 3) return
          for (let m = 0; m < 700; m++) table.stock.push(stockRow(900_000 + m, '1000', '0001'))
          let gone = 0
          table.stock = table.stock.filter(
            (r) => !(r.Plant === '1000' && r.StorageLocation === '0002' && gone++ < 100),
          )
        },
      },
    )
    const params = withPageSink({ page: 1, limit: 500 })
    const locs = await new SapInventoryAdapter().listLocations(CREDS, params)
    expect(calls.length).toBeGreaterThan(3)
    expect(locs.map((l) => l.id)).toEqual(table.ids)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, pagedLocally: true })
  })

  it('never makes a location out of stock with no plant', async () => {
    // Plant is a key of A_MatlStkInAcctMod; a row without one is not a location.
    const table = cellsTable([
      ['', '0001', 3],
      ['1000', '', 3],
      ['1000', '0001', 3],
    ])
    fakeSap({ 'token-a': table })
    const params = withPageSink({ page: 1, limit: 10 })
    const locs = await new SapInventoryAdapter().listLocations(CREDS, params)
    expect(locs.map((l) => l.id)).toEqual(['1000', '1000:0001'])
  })

  it('writes a quote in a plant code as an OData string literal does', async () => {
    const table = cellsTable([
      ["A'1", '', 500],
      ['B1', '0001', 1],
    ])
    const calls = fakeSap({ 'token-a': table })
    const { seen } = await drive(5, 1, CREDS, calls)
    expect(seen).toEqual(["A'1", 'B1', 'B1:0001'])
    expect(filters(calls)[1]).toBe("Plant eq 'A''1' and StorageLocation gt ''")
  })

  it.each([
    // What a host other than the tenant's API host can answer.
    ['a logon page', '<html><body>Logon</body></html>'],
    ['null', null],
    ['a JSON array', []],
  ])('refuses %s rather than reading it as no locations', async (_, body) => {
    fakeSap({}, { body })
    await expect(
      new SapInventoryAdapter().listLocations(CREDS, withPageSink({ page: 1, limit: 3 })),
    ).rejects.toThrow(/A_MatlStkInAcctMod answered with a body that is not OData JSON/)
  })

  it('reads a JSON body with no d envelope as no stock', async () => {
    // The paging-contract gate answers every request with such a body.
    fakeSap({}, { body: { access_token: 'stub' } })
    const params = withPageSink({ page: 1, limit: 3 })
    const locs = await new SapInventoryAdapter().listLocations(CREDS, params)
    expect(locs).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, pagedLocally: true })
  })

  it('refuses rows that come back out of Plant, StorageLocation order', async () => {
    // A service that ignores $orderby interleaves locations, and a location
    // would then be served on more than one page. Fail loudly instead.
    fakeSap({ 'token-a': stockTable(7, 180) }, { ignoreOrderby: true })
    await expect(
      new SapInventoryAdapter().listLocations(CREDS, withPageSink({ page: 1, limit: 3 })),
    ).rejects.toThrow(/did not apply \$orderby=Plant,StorageLocation/)
  })

  it('refuses a plant that comes back after another plant', async () => {
    // Sorted by StorageLocation first, every pair's rows are still together,
    // but plant 1000 comes after plant 1010's plant-level stock.
    fakeSap({ 'token-a': stockTable(7, 180) }, { sortsBy: 'StorageLocation,Plant' })
    await expect(
      new SapInventoryAdapter().listLocations(CREDS, withPageSink({ page: 1, limit: 3 })),
    ).rejects.toThrow(
      /Plant 1000 \/ StorageLocation 0001 after Plant 1010 \/ StorageLocation \(none\).*did not apply \$orderby/,
    )
  })

  it('refuses a storage location that comes back after another in its plant', async () => {
    // Sorted by Plant alone, a plant's storage locations interleave by material.
    fakeSap({ 'token-a': stockTable(7, 180) }, { sortsBy: 'Plant' })
    await expect(
      new SapInventoryAdapter().listLocations(CREDS, withPageSink({ page: 1, limit: 3 })),
    ).rejects.toThrow(
      /Plant 1010 \/ StorageLocation \(none\) after Plant 1010 \/ StorageLocation 0002.*did not apply \$orderby/,
    )
  })

  it('refuses a service that ignores $orderby even where each page looks sorted', async () => {
    // Key order is Material first. With 700 plants stocked by each of two
    // materials, the first page is material 1's first 500 plants, in order.
    // The disorder only shows past it, where material 2 starts again.
    const cells = Array.from({ length: 700 }, (_, i) => [String(1000 + i), '', 2] as const)
    fakeSap({ 'token-a': cellsTable(cells) }, { ignoreOrderby: true })
    await expect(
      new SapInventoryAdapter().listLocations(CREDS, withPageSink({ page: 1, limit: 500 })),
    ).rejects.toThrow(
      /Plant 1500 \/ StorageLocation \(none\) after Plant 1699.*did not apply \$orderby/,
    )
  })

  it('refuses a service that ignores $filter rather than serving locations again', async () => {
    fakeSap({ 'token-a': stockTable(7, 180) }, { ignoreFilter: true })
    await expect(drive(3, 2)).rejects.toThrow(
      /answered \$filter=Plant eq '1010' and StorageLocation gt '0001' with Plant 1000 \/ StorageLocation 0001, which it excludes/,
    )
  })
  it('refuses stock of another plant in answer to a filter within one plant', async () => {
    // A service that drops the Plant half of `Plant eq … and StorageLocation
    // gt …` hands back plant 1010's storage locations with plant 1000's, and
    // would serve plant 1010 again once the walk reached it.
    const table = cellsTable([
      ['1000', '', 500],
      ['1000', '0001', 1],
      ['1010', '', 1],
      ['1010', '0002', 1],
    ])
    fakeSap({ 'token-a': table }, { appliesFilter: (f) => f.replace(/^Plant eq '[^']*' and /, '') })
    await expect(
      new SapInventoryAdapter().listLocations(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(
      /answered \$filter=Plant eq '1000' and StorageLocation gt '' with Plant 1010 \/ StorageLocation 0002, which it excludes/,
    )
  })

  it('refuses stock of the plant it asked to pass', async () => {
    // Answering `Plant gt` as `Plant ge` sends the plant's stock again, and
    // its storage locations would be served twice.
    const table = cellsTable([
      ['1000', '', 500],
      ['1000', '0001', 1],
      ['1010', '', 1],
    ])
    fakeSap({ 'token-a': table }, { appliesFilter: (f) => f.replace(/^Plant gt /, 'Plant ge ') })
    await expect(
      new SapInventoryAdapter().listLocations(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(
      /answered \$filter=Plant gt '1000' with Plant 1000 \/ StorageLocation \(none\), which it excludes/,
    )
  })

  it('refuses stock of the pair it asked to pass', async () => {
    // Answering `StorageLocation gt` as `ge` sends the pair's stock again: a
    // location holding a full page of it would be asked for over and over.
    const table = cellsTable([
      ['1000', '0001', 1000],
      ['1000', '0002', 1],
    ])
    fakeSap(
      { 'token-a': table },
      { appliesFilter: (f) => f.replace(' StorageLocation gt ', ' StorageLocation ge ') },
    )
    await expect(
      new SapInventoryAdapter().listLocations(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(
      /answered \$filter=Plant eq '1000' and StorageLocation gt '0001' with Plant 1000 \/ StorageLocation 0001, which it excludes/,
    )
  })
})
