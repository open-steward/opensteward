/**
 * GOFRUGAL listProducts / listInventoryLevels paging.
 *
 * Both read GET /WebReporter/api/v1/items, which documents no paging at all
 * (https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/list-all-items):
 *   "Used to list all the items"
 * The request is `GET .../items` with the `X-Auth-Token` header and nothing
 * else: no page, limit or q. So every call returns the whole collection and
 * the adapter pages it locally, reporting `pagedLocally` and an exact total.
 *
 * Inventory rows are the flattened `stock[]` entries of each item row, so the
 * slice must be taken over the flattened rows, not over items: slicing items
 * returned more than `limit` levels per page, and the router's truncation then
 * dropped the overflow on every page.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { GofrugalAdapter } from '../../../../../../src/verticals/ecommerce/adapters/gofrugal/index'

const CREDS = {
  accessToken: 'gf-key',
  extra: {
    apiKey: 'gf-key',
    baseUrl: 'https://retaileasy.example.com/WebReporter/api/v1',
    currency: 'INR',
  },
}

interface RawItem {
  itemId: number
  itemName: string
  locationId: number
  stock: { stock: number; salePrice: number }[]
}

function item(itemId: number, stockEntries = 1): RawItem {
  return {
    itemId,
    itemName: `item-${itemId}`,
    locationId: 1,
    stock: Array.from({ length: stockEntries }, (_, i) => ({ stock: i + 1, salePrice: 10 })),
  }
}

/**
 * A fake WebReporter serving GET /items with only what the docs document:
 * no query parameters. Anything else is refused.
 */
function fakeItems(items: RawItem[]) {
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (path !== '/items') throw new Error(`unexpected GET path in test: ${path}`)
    const sent = Object.keys(cfg?.params ?? {})
    if (sent.length > 0) throw new Error(`undocumented query parameter(s): ${sent.join(', ')}`)
    return { data: { items } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
  return { get }
}

afterEach(() => vi.restoreAllMocks())

const L = 2
const N = 2 * L + 1

describe('GOFRUGAL listProducts paging (GET /items, unpaginated upstream)', () => {
  const adapter = () => new GofrugalAdapter()

  it('pages 1..3 at limit L over 2L+1 items serve every id once, in order, with hasMore exact', async () => {
    fakeItems(Array.from({ length: N }, (_, i) => item(i + 1)))
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await adapter().listProducts(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      const up = readUpstreamPage(params)
      hasMore.push(up?.hasMore)
      expect(up?.pagedLocally).toBe(true)
      expect(up?.totalCount).toBe(N)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('the page-2 request sends no parameters (none are documented) and serves new rows', async () => {
    const { get } = fakeItems(Array.from({ length: N }, (_, i) => item(i + 1)))
    const rows = await adapter().listProducts(CREDS, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['3', '4'])
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('/items')
    expect(Object.keys(get.mock.calls[0]![1]?.params ?? {})).toEqual([])
  })

  it('a limit above the declared maximum is clamped by the router and still serves every row', async () => {
    const a = adapter()
    const max = a.capabilities.maxPageSize
    const total = 2 * max + 1
    fakeItems(Array.from({ length: total }, (_, i) => item(i + 1)))
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink(parseListQuery({ page: String(k), limit: '9999' }, a))
      expect(params.limit).toBe(max)
      const rows = await a.listProducts(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: total }, (_, i) => String(i + 1)))
    expect(hasMore).toEqual([true, true, false])
  })

  it('without a limit it returns the whole collection rather than a 50-row default page', async () => {
    fakeItems(Array.from({ length: 60 }, (_, i) => item(i + 1)))
    const params = withPageSink({ page: 1 } as QueryParams)
    const rows = await adapter().listProducts(CREDS, params)
    expect(rows).toHaveLength(60)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('through the API path, parseListQuery then listPage report meta.hasMore exactly', async () => {
    fakeItems(Array.from({ length: N }, (_, i) => item(i + 1)))
    const a = adapter()
    const p2: QueryParams = withPageSink(parseListQuery({ page: '2', limit: String(L) }, a))
    const env2 = listPage(await a.listProducts(CREDS, p2), p2, 'gofrugal')
    expect(env2.data.map((r) => r.id)).toEqual(['3', '4'])
    expect(env2.meta.hasMore).toBe(true)
    expect(env2.meta.totalCount).toBe(N)

    const p3: QueryParams = withPageSink(parseListQuery({ page: '3', limit: String(L) }, a))
    const env3 = listPage(await a.listProducts(CREDS, p3), p3, 'gofrugal')
    expect(env3.data.map((r) => r.id)).toEqual(['5'])
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('GOFRUGAL listInventoryLevels paging (flattened stock[] of GET /items)', () => {
  const adapter = () => new GofrugalAdapter()
  // 2 + 2 + 1 = 5 = 2L + 1 inventory rows, from 3 item rows.
  const ITEMS = () => [item(1, 2), item(2, 2), item(3, 1)]
  const IDS = ['1:1:0', '1:1:1', '2:1:0', '2:1:1', '3:1:0']

  it('pages 1..3 at limit L over 2L+1 levels serve every id once, in order, with hasMore exact', async () => {
    fakeItems(ITEMS())
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await adapter().listInventoryLevels(CREDS, params)
      expect(rows.length).toBeLessThanOrEqual(L)
      seen.push(...rows.map((r) => r.id))
      const up = readUpstreamPage(params)
      hasMore.push(up?.hasMore)
      expect(up?.pagedLocally).toBe(true)
      expect(up?.totalCount).toBe(IDS.length)
    }
    expect(seen).toEqual(IDS)
    expect(hasMore).toEqual([true, true, false])
  })

  it('the page-2 request sends no parameters (none are documented)', async () => {
    const { get } = fakeItems(ITEMS())
    const rows = await adapter().listInventoryLevels(CREDS, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['2:1:0', '2:1:1'])
    expect(Object.keys(get.mock.calls[0]![1]?.params ?? {})).toEqual([])
  })

  it('a limit above the declared maximum is clamped by the router and still serves every row', async () => {
    const a = adapter()
    const max = a.capabilities.maxPageSize
    const total = 2 * max + 1
    fakeItems(Array.from({ length: total }, (_, i) => item(i + 1)))
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink(parseListQuery({ page: String(k), limit: '9999' }, a))
      expect(params.limit).toBe(max)
      const rows = await a.listInventoryLevels(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: total }, (_, i) => `${i + 1}:1:0`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('through the API path, no level is truncated away and meta.hasMore is exact', async () => {
    fakeItems(ITEMS())
    const a = adapter()
    const seen: string[] = []
    const hasMore: Array<boolean | null | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params: QueryParams = withPageSink(
        parseListQuery({ page: String(k), limit: String(L) }, a),
      )
      const env = listPage(await a.listInventoryLevels(CREDS, params), params, 'gofrugal')
      seen.push(...env.data.map((r) => r.id))
      hasMore.push(env.meta.hasMore)
    }
    expect(seen).toEqual(IDS)
    expect(hasMore).toEqual([true, true, false])
  })
})
