/**
 * Shiprocket listCarriers paging. The adapter returned the whole courier list
 * for every page, so the router truncated it to `limit` and page 2 repeated
 * page 1.
 *
 * First-party docs: Shiprocket's published Postman collection,
 * https://apidocs.shiprocket.in/ (Couriers > "List of Couriers"),
 * GET courier/courierListWithCounts:
 *
 *   "This API will work on a company level."
 *   "You can use filters to sort your data. By default, all the couriers are
 *    shown if no filter is used."
 *
 * Its parameter table lists only `type` ("Possible values are :
 * active/inactive/all"): no page or size parameter, so the endpoint answers
 * the whole collection and the adapter pages it locally.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/logistics/adapters/shiprocket/client', () => ({
  ShiprocketClient: class {
    get = (path: string, params?: Record<string, unknown>) => getMock(path, params)
  },
}))

import { ShiprocketAdapter } from '../../../../../../src/verticals/logistics/adapters/shiprocket'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'

const CREDS = { accessToken: 'TEST_token' } as Credentials
const L = 5
const N = 2 * L + 1
/** The router's global page cap; Shiprocket documents no maximum for this endpoint. */
const ROUTER_MAX = 500
const COURIER_PATH = 'courier/courierListWithCounts'
const COURIER_KEYS = new Set(['type'])

const clean = (params?: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined))

/**
 * The documented endpoint: honours only `type`, answers every courier at once.
 * Every third courier is inactive (status 0): with no `type` filter the docs
 * say "all the couriers are shown", so inactive rows belong in the collection.
 */
function fakeCouriers(total: number) {
  const ids = Array.from({ length: total }, (_, i) => String(1000 + i))
  getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
    if (path !== COURIER_PATH) throw new Error(`404: ${path}`)
    const q = clean(params)
    const bad = Object.keys(q).filter((k) => !COURIER_KEYS.has(k))
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    return {
      total_courier_count: total,
      courier_count: total,
      courier_data: ids.map((id, i) => ({
        id: Number(id),
        name: `Courier ${id}`,
        status: i % 3 === 0 ? 0 : 1,
      })),
    }
  })
  return ids
}

beforeEach(() => {
  getMock.mockReset()
  _resetRowPager()
})

describe('shiprocket listCarriers paging (unpaginated upstream)', () => {
  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    const expected = fakeCouriers(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await new ShiprocketAdapter().listCarriers(CREDS, params)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('keeps inactive couriers in the walk and the total (no filter is sent, so all are shown)', async () => {
    const expected = fakeCouriers(N)
    const inactive = expected.filter((_, i) => i % 3 === 0)
    expect(inactive.length).toBeGreaterThan(0)
    const seen: Array<{ id?: string; isActive?: boolean }> = []
    let total: number | undefined
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await new ShiprocketAdapter().listCarriers(CREDS, params)))
      total ??= readUpstreamPage(params)?.totalCount
    }
    expect(total).toBe(N)
    expect(seen.filter((c) => c.isActive === false).map((c) => c.id)).toEqual(inactive)
  })

  it('the page-2 request sends no paging params, which the endpoint does not document', async () => {
    fakeCouriers(N)
    await new ShiprocketAdapter().listCarriers(CREDS, withPageSink({ page: 2, limit: L }))
    expect(getMock).toHaveBeenCalledTimes(1)
    const [path, params] = getMock.mock.calls[0] as [string, Record<string, unknown>?]
    expect(path).toBe(COURIER_PATH)
    expect(clean(params)).toEqual({})
  })

  it('reports the whole collection as the total', async () => {
    fakeCouriers(N)
    const params = withPageSink({ page: 1, limit: L })
    await new ShiprocketAdapter().listCarriers(CREDS, params)
    expect(readUpstreamPage(params)?.totalCount).toBe(N)
  })

  it('a limit above the router cap is clamped, and the last page of 600 is served', async () => {
    expect(parseListQuery({ page: '1', limit: '100000' }).limit).toBe(ROUTER_MAX)
    const expected = fakeCouriers(600)
    const params = withPageSink({ page: 2, limit: ROUTER_MAX })
    const rows = await new ShiprocketAdapter().listCarriers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(expected.slice(ROUTER_MAX))
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: false, pagedLocally: true }),
    )
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const expected = fakeCouriers(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(
      await new ShiprocketAdapter().listCarriers(CREDS, params),
      params,
      'shiprocket',
    )
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, hasMore: true, totalCount: N }),
    )
  })
})

/**
 * listWarehouses / getWarehouse. Pickup Addresses > "Get All Pickup Locations",
 * GET settings/company/pickup: "No parameters are required to use this API."
 * The documented answer nests the rows: {data: {shipping_address: [...],
 * allow_more, company_name, recent_addresses}}. No page or size parameter is
 * documented, so the whole list comes back and the adapter pages it locally.
 */
const PICKUP_PATH = 'settings/company/pickup'

/** The documented endpoint: takes no parameters, answers every location at once. */
function fakePickups(total: number) {
  const ids = Array.from({ length: total }, (_, i) => String(4984500 + i))
  getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
    if (path !== PICKUP_PATH) throw new Error(`404: ${path}`)
    const bad = Object.keys(clean(params))
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    return {
      data: {
        shipping_address: ids.map((id) => ({
          id: Number(id),
          pickup_location: `Loc ${id}`,
          address: '1900 GF, Sector 45',
          city: 'Gurgaon',
          state: 'Haryana',
          country: 'India',
          pin_code: '122003',
          status: 2,
        })),
        allow_more: 'true',
        is_blackbox_seller: false,
        company_name: 'CASA MODERNA',
        recent_addresses: [],
      },
    }
  })
  return ids
}

describe('shiprocket listWarehouses (documented data.shipping_address[], unpaginated)', () => {
  it('serves every location once, in order, across pages 1..3 with exact hasMore', async () => {
    const expected = fakePickups(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await new ShiprocketAdapter().listWarehouses(CREDS, params)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('sends no parameters, since the endpoint documents none', async () => {
    fakePickups(N)
    await new ShiprocketAdapter().listWarehouses(CREDS, withPageSink({ page: 2, limit: L }))
    expect(getMock).toHaveBeenCalledTimes(1)
    const [path, params] = getMock.mock.calls[0] as [string, Record<string, unknown>?]
    expect(path).toBe(PICKUP_PATH)
    expect(clean(params)).toEqual({})
  })

  it('an account with no pickup locations is an empty, complete page', async () => {
    fakePickups(0)
    const params = withPageSink({ page: 1, limit: L })
    expect(await new ShiprocketAdapter().listWarehouses(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('refuses an answer without data.shipping_address instead of reporting an empty account', async () => {
    getMock.mockResolvedValue({ data: [] })
    const params = withPageSink({ page: 1, limit: L })
    await expect(new ShiprocketAdapter().listWarehouses(CREDS, params)).rejects.toThrow(
      /no data\.shipping_address array/,
    )
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const expected = fakePickups(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(
      await new ShiprocketAdapter().listWarehouses(CREDS, params),
      params,
      'shiprocket',
    )
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, hasMore: true, totalCount: N }),
    )
  })
})

describe('shiprocket getWarehouse (reads the same documented shape)', () => {
  it('finds a location listed under data.shipping_address', async () => {
    const ids = fakePickups(N)
    const w = await new ShiprocketAdapter().getWarehouse(CREDS, ids[7]!)
    expect(w.id).toBe(ids[7])
    expect(w.name).toBe(`Loc ${ids[7]}`)
  })

  it('throws when the id is not among the locations', async () => {
    fakePickups(3)
    await expect(new ShiprocketAdapter().getWarehouse(CREDS, '1')).rejects.toThrow(
      /pickup location not found: 1/,
    )
  })
})
