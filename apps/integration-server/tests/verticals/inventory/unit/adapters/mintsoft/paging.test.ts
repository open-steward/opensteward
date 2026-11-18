/**
 * Mintsoft list methods against a fake that honours only what the first-party
 * Swagger 2.0 spec documents (https://api.mintsoft.co.uk/swagger/docs/v1):
 *
 * - GET /api/ASN/List (ASN_ListASNs): "PageNo" ("Page No - Default 1"),
 *   "Limit" ("Number of Result to be returned - Default 100 - Max 100"),
 *   "IncludeASNItems" ("Request the ASN items"), "SinceLastUpdated" ("Filter by
 *   any ASNs that have been Updated Since supplied Timestamp"), plus filters the
 *   adapter does not send. A bare array, no total. The path /api/ASN itself is
 *   PUT only (ASN_CreateASN), so a GET there is a 404 here.
 * - GET /api/Warehouse (Warehouse_GetWarehouses): no parameters, a bare array.
 * - Stock adjustments: no list endpoint, so the method refuses with no request.
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
import { MintsoftAdapter } from '../../../../../../src/verticals/inventory/adapters/mintsoft/index'
import type { RawMintsoftASN } from '../../../../../../src/verticals/inventory/adapters/mintsoft/transform/purchase-order'
import type { RawMintsoftWarehouse } from '../../../../../../src/verticals/inventory/adapters/mintsoft/transform/location'
import { PurchaseOrderSchema } from '../../../../../../src/verticals/inventory/schema/purchase-order'
import { LocationSchema } from '../../../../../../src/verticals/inventory/schema/location'

const CREDS = { accessToken: 'ms-key' }

interface Seen {
  path: string
  params: Record<string, unknown> | undefined
}

const ASN_LIST_PARAMS = new Set([
  'ASNStatusId',
  'ClientId',
  'PageNo',
  'Limit',
  'WarehouseId',
  'SinceLastUpdated',
  'BookedInStartInterval',
  'BookedInEndInterval',
  'IncludeASNItems',
])

function asns(n: number): RawMintsoftASN[] {
  return Array.from({ length: n }, (_, i) => ({
    ID: i + 1,
    POReference: `PO-${i + 1}`,
    ProductSupplierId: 900 + i,
    WarehouseId: 3,
    ASNStatusId: 1,
    LastUpdated: new Date(Date.UTC(2024, 0, 1 + i)).toISOString(),
    Items: [{ ID: 10_000 + i, ASNId: i + 1, ProductId: 70 + i, QuantityExpected: 5 }],
  }))
}

function warehouses(n: number): RawMintsoftWarehouse[] {
  return Array.from({ length: n }, (_, i) => ({
    ID: i + 1,
    Name: `Warehouse ${i + 1}`,
    Active: true,
    AddressLine1: `${i + 1} Dock Road`,
    City: 'Leeds',
    PostCode: 'LS1 1AA',
  }))
}

/** A fake Mintsoft at the axios seam MintsoftClient uses. */
function fakeMintsoft(opts: { asns?: RawMintsoftASN[]; warehouses?: RawMintsoftWarehouse[] }) {
  const seen: Seen[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params
    seen.push({ path, params })
    if (path === '/api/ASN/List') {
      for (const k of Object.keys(params ?? {})) {
        if (!ASN_LIST_PARAMS.has(k)) {
          throw Object.assign(new Error(`undocumented ASN/List param ${k}`), {
            response: { status: 400 },
          })
        }
      }
      const pageNo = Number(params?.PageNo ?? 1)
      const limit = Math.min(Number(params?.Limit ?? 100), 100)
      let rows = opts.asns ?? []
      if (params?.SinceLastUpdated !== undefined) {
        const since = new Date(String(params.SinceLastUpdated)).getTime()
        rows = rows.filter((r) => new Date(String(r.LastUpdated)).getTime() >= since)
      }
      if (params?.IncludeASNItems !== true) {
        rows = rows.map(({ Items: _items, ...rest }) => rest as RawMintsoftASN)
      }
      return { data: rows.slice((pageNo - 1) * limit, pageNo * limit) }
    }
    if (path === '/api/Warehouse') {
      if (params && Object.keys(params).length > 0) {
        throw Object.assign(new Error('Warehouse takes no params'), { response: { status: 400 } })
      }
      return { data: opts.warehouses ?? [] }
    }
    throw Object.assign(new Error(`unexpected GET ${path}`), { response: { status: 404 } })
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as unknown as ReturnType<typeof axios.create>)
  return { seen, get }
}

function routed(adapter: MintsoftAdapter): InventoryAdapter {
  return adapter
}

afterEach(() => vi.restoreAllMocks())

describe('mintsoft listPurchaseOrders (GET /api/ASN/List)', () => {
  const L = 4

  async function walk(limit: number, pages: number, extra: Partial<QueryParams> = {}) {
    const adapter = new MintsoftAdapter()
    const served: string[] = []
    const sizes: Array<number | undefined> = []
    for (let page = 1; page <= pages; page++) {
      const params = withPageSink({ page, limit, ...extra })
      served.push(...(await adapter.listPurchaseOrders(CREDS, params)).map((r) => r.id))
      sizes.push(readUpstreamPage(params)?.pageSize)
    }
    return { served, sizes }
  }

  it('serves N = 2L + 1 ASNs once each over three pages', async () => {
    const N = 2 * L + 1
    fakeMintsoft({ asns: asns(N) })
    const { served } = await walk(L, 3)
    expect(served).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('sends the caller page and limit as PageNo and Limit, with items requested', async () => {
    const { seen } = fakeMintsoft({ asns: asns(2 * L + 1) })
    await walk(L, 3)
    expect(seen).toEqual(
      [1, 2, 3].map((p) => ({
        path: '/api/ASN/List',
        params: { PageNo: p, Limit: L, IncludeASNItems: true },
      })),
    )
  })

  it('returns the ASN lines, which the list omits unless IncludeASNItems is sent', async () => {
    fakeMintsoft({ asns: asns(1) })
    const [po] = await new MintsoftAdapter().listPurchaseOrders(
      CREDS,
      withPageSink({ page: 1, limit: L }),
    )
    expect(po?.lines).toEqual([
      { productId: '70', quantityOrdered: 5, quantityReceived: undefined },
    ])
    expect(PurchaseOrderSchema.parse(po).supplierId).toBe('900')
  })

  it('clamps Limit to the documented Max 100 and reports that size', async () => {
    const N = 2 * 100 + 1
    const { seen } = fakeMintsoft({ asns: asns(N) })
    const { served, sizes } = await walk(500, 3)
    expect(seen.map((s) => s.params?.Limit)).toEqual([100, 100, 100])
    expect(sizes).toEqual([100, 100, 100])
    expect(served).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('reports hasMore on the API path from the short last page', async () => {
    const N = 2 * L + 1
    fakeMintsoft({ asns: asns(N) })
    const adapter = new MintsoftAdapter()
    const metas = []
    for (let page = 1; page <= 3; page++) {
      const p = parseListQuery({ page: String(page), limit: String(L) }, routed(adapter))
      metas.push(listPage(await adapter.listPurchaseOrders(CREDS, p), p, adapter.platform).meta)
    }
    // No total is documented: a full page leaves hasMore unknown, a short one ends it.
    expect(metas.map((m) => m.hasMore)).toEqual([null, null, false])
  })

  it('sends updatedAfter as SinceLastUpdated', async () => {
    const { seen } = fakeMintsoft({ asns: asns(10) })
    const updatedAfter = new Date('2024-01-05T00:00:00Z')
    const { served } = await walk(L, 2, { updatedAfter })
    expect(seen[0]?.params).toEqual({
      PageNo: 1,
      Limit: L,
      IncludeASNItems: true,
      SinceLastUpdated: '2024-01-05T00:00:00.000Z',
    })
    expect(served).toEqual(['5', '6', '7', '8', '9', '10'])
  })

  it('getPurchaseOrder reads GET /api/ASN/{id}', async () => {
    const get = vi.fn(async () => ({ data: asns(3)[2] }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as unknown as ReturnType<typeof axios.create>)
    const po = await new MintsoftAdapter().getPurchaseOrder(CREDS, '3')
    expect(get).toHaveBeenCalledWith('/api/ASN/3', { params: undefined })
    expect(po.id).toBe('3')
  })
})

describe('mintsoft listLocations (GET /api/Warehouse, unpaged)', () => {
  const L = 3

  it('serves N = 2L + 1 warehouses once each and reports the end exactly', async () => {
    const N = 2 * L + 1
    const { seen } = fakeMintsoft({ warehouses: warehouses(N) })
    const adapter = new MintsoftAdapter()
    const served: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      served.push(...(await adapter.listLocations(CREDS, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(hasMore).toEqual([true, true, false])
    expect(seen.map((s) => ({ path: s.path, params: s.params }))).toEqual(
      Array.from({ length: 3 }, () => ({ path: '/api/Warehouse', params: undefined })),
    )
  })

  it('getLocation finds a warehouse whatever page it would fall on', async () => {
    fakeMintsoft({ warehouses: warehouses(600) })
    const found = await new MintsoftAdapter().getLocation(CREDS, '600')
    expect(LocationSchema.parse(found).name).toBe('Warehouse 600')
  })
})

describe('mintsoft stock adjustments (no documented list)', () => {
  it('listStockAdjustments refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const { get } = fakeMintsoft({})
    await expect(
      new MintsoftAdapter().listStockAdjustments(CREDS, withPageSink({ page: 1, limit: 50 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
  })

  it('getStockAdjustment refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const { get } = fakeMintsoft({})
    await expect(new MintsoftAdapter().getStockAdjustment(CREDS, '1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })
})
