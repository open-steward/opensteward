/**
 * Sellbrite warehouses (listLocations) are one unpaginated collection, paged
 * here.
 *
 * From https://developer.sellbrite.com/endpoints/warehouses.html:
 *
 *   "GET https://api.sellbrite.com/v1/warehouses"
 *   "Get a list of warehouses"
 *
 * That page documents no Query Params section and a bare array response. The
 * sibling /products and /inventory pages do list `limit` and `page` query
 * params. So the warehouses endpoint answers every request with every
 * warehouse. The adapter used to return that whole array for every caller
 * page: page 2 repeated page 1, and the router truncated each page to `limit`,
 * so warehouses past the first page could not be reached.
 *
 * The fake below honours ONLY what the page documents, which is nothing: it
 * ignores any query parameter and always returns the whole list.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import type { InventoryAdapter } from '../../../../../../src/verticals/inventory/adapter/interface'
import { SellbriteAdapter } from '../../../../../../src/verticals/inventory/adapters/sellbrite/index'
import type { RawSellbriteWarehouse } from '../../../../../../src/verticals/inventory/adapters/sellbrite/transform/location'
import { LocationSchema } from '../../../../../../src/verticals/inventory/schema/location'

const CREDS = { accessToken: Buffer.from('acct-token:secret').toString('base64') }

interface Seen {
  path: string
  params: Record<string, unknown> | undefined
}

/**
 * The adapter as the router holds it: typed as the vertical interface, whose
 * optional `capabilities` is what parseListQuery reads a declared max from.
 */
function routed(adapter: SellbriteAdapter): InventoryAdapter {
  return adapter
}

/** 1-based position of the one archived warehouse in a fixture of `n`. */
function archivedAt(n: number): number {
  return Math.floor(n / 2) + 1
}

/**
 * `n` warehouses in the fixed order Sellbrite returns them. The middle one is
 * archived: it is still a warehouse (transformLocation keeps it, isActive
 * false), so it must be served in its place like any other row.
 */
function warehouses(n: number): RawSellbriteWarehouse[] {
  return Array.from({ length: n }, (_, i) => ({
    uuid: `wh-${String(i + 1).padStart(4, '0')}`,
    name: `Warehouse ${i + 1}`,
    archived: i + 1 === archivedAt(n),
  }))
}

/**
 * A fake Sellbrite at the axios seam the client uses. GET /warehouses returns
 * every warehouse whatever the query string says, because none is documented.
 */
function fakeSellbrite(rows: RawSellbriteWarehouse[]) {
  const seen: Seen[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    seen.push({ path, params: config?.params })
    if (path === '/warehouses') return { data: rows }
    throw Object.assign(new Error(`unexpected GET ${path}`), { response: { status: 404 } })
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as unknown as ReturnType<typeof axios.create>)
  return { seen }
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `wh-${String(start + i).padStart(4, '0')}`)
}

/** Drive listLocations the way the sync worker does: pages 1, 2, 3 at `limit`. */
async function drive(limit: number, pages = 3) {
  const adapter = new SellbriteAdapter()
  const served: string[] = []
  const inactive: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const totals: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params: QueryParams = withPageSink({ page, limit })
    const rows = await adapter.listLocations(CREDS, params)
    served.push(...rows.map((r) => r.id))
    inactive.push(...rows.filter((r) => !r.isActive).map((r) => r.id))
    const meta = readUpstreamPage(params)
    hasMore.push(meta?.hasMore)
    totals.push(meta?.totalCount)
  }
  return { served, inactive, hasMore, totals }
}

afterEach(() => vi.restoreAllMocks())

describe('sellbrite listLocations paging', () => {
  const L = 7

  it('serves N = 2L + 1 warehouses once each over three pages, and reports the end', async () => {
    const N = 2 * L + 1
    const { seen } = fakeSellbrite(warehouses(N))
    const { served, inactive, hasMore, totals } = await drive(L)
    expect(served).toEqual(ids(1, N))
    // The archived warehouse (wh-0008, first row of page 2) is served in its
    // place, not dropped from a page whose hasMore and total still count it.
    expect(inactive).toEqual(['wh-0008'])
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([N, N, N])
    expect(seen).toHaveLength(3)
  })

  it('sends every page exactly as documented: GET /warehouses with no query parameters', async () => {
    const { seen } = fakeSellbrite(warehouses(2 * L + 1))
    await drive(L, 3)
    // No parameter is documented, so none is sent on any page: a limit or page
    // of our own would be read by nothing and only suggest the endpoint pages.
    expect(seen.map((s) => ({ path: s.path, params: s.params ?? {} }))).toEqual([
      { path: '/warehouses', params: {} },
      { path: '/warehouses', params: {} },
      { path: '/warehouses', params: {} },
    ])
  })

  it('ends on page 2 when N = 2L, and page 3 is empty', async () => {
    const N = 2 * L
    fakeSellbrite(warehouses(N))
    const { served, hasMore } = await drive(L)
    expect(served).toEqual(ids(1, N))
    expect(hasMore).toEqual([true, false, false])
  })

  it('serves every warehouse at the largest page the router allows', async () => {
    // Sellbrite documents no page maximum for warehouses; the router caps at 500.
    const N = 1201
    fakeSellbrite(warehouses(N))
    const served: string[] = []
    const hasMore: Array<boolean | undefined> = []
    const adapter = new SellbriteAdapter()
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: '10000' }, routed(adapter))
      expect(params.limit).toBe(500)
      const rows = await adapter.listLocations(CREDS, params)
      served.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(1, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('pages a limit as parseListQuery delivers it', async () => {
    const N = 2 * L + 1
    fakeSellbrite(warehouses(N))
    const adapter = new SellbriteAdapter()
    const served: string[] = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed(adapter))
      served.push(...(await adapter.listLocations(CREDS, params)).map((r) => r.id))
    }
    expect(served).toEqual(ids(1, N))
  })

  it('reports hasMore and the total on the API path (parseListQuery + listPage)', async () => {
    const N = 2 * L + 1
    fakeSellbrite(warehouses(N))
    const adapter = new SellbriteAdapter()

    const p2 = parseListQuery({ page: '2', limit: String(L) }, routed(adapter))
    const e2 = listPage(await adapter.listLocations(CREDS, p2), p2, adapter.platform)
    expect(e2.data.map((r) => r.id)).toEqual(ids(L + 1, L))
    expect(e2.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, hasMore: true, totalCount: N }),
    )

    const p3 = parseListQuery({ page: '3', limit: String(L) }, routed(adapter))
    const e3 = listPage(await adapter.listLocations(CREDS, p3), p3, adapter.platform)
    expect(e3.data.map((r) => r.id)).toEqual(ids(2 * L + 1, 1))
    expect(e3.meta).toEqual(
      expect.objectContaining({ page: 3, limit: L, hasMore: false, totalCount: N }),
    )
  })

  it('getLocation finds a warehouse past the largest page the router allows', async () => {
    // 1201 rows, more than the router's 500 cap: a lookup that asked
    // listLocations for any one page, even the largest, would miss the last.
    fakeSellbrite(warehouses(1201))
    const found = await new SellbriteAdapter().getLocation(CREDS, 'wh-1201')
    expect(found.id).toBe('wh-1201')
    expect(() => LocationSchema.parse(found)).not.toThrow()
  })
})
