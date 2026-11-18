/**
 * OzonAdapter request shapes and paging, with the HTTP layer mocked.
 *
 * Methods and bodies are from Ozon's official Seller API spec, each path
 * confirmed live on 2026-09-13:
 *   POST /v1/warehouse/list   {}                                  → { result: Warehouse[] }
 *   POST /v2/products/stocks  { stocks: [{ offer_id, warehouse_id, stock }] } → { result: [...] }
 *   POST /v3/posting/fbs/get  { posting_number }                  → { result: Posting }
 *   https://docs.ozon.ru/api/seller/
 *   https://web.archive.org/web/20240531073337/https://docs.ozon.ru/api/seller/swagger.json
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { OzonAdapter } from '../../../../../../src/verticals/ecommerce/adapters/ozon/index'

const CREDS = { accessToken: 'api-key-secret', extra: { clientId: '1943980' } }

interface Call {
  path: string
  body: unknown
}

function fakeOzon(answer: (path: string, body: unknown) => unknown): Call[] {
  const calls: Call[] = []
  const post = vi.fn(async (path: string, body: unknown) => {
    calls.push({ path, body })
    return { data: answer(path, body) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
  return calls
}

const warehouse = (id: number, name: string) => ({ warehouse_id: id, name, status: 'created', is_rfbs: false })

afterEach(() => vi.restoreAllMocks())

describe('OzonAdapter locations', () => {
  it('lists every warehouse from one call on page 1 and reports no more pages', async () => {
    const calls = fakeOzon(() => ({ result: [warehouse(1, 'A'), warehouse(2, 'B')] }))
    const params = withPageSink({ page: 1, limit: 50 })
    const locations = await new OzonAdapter().listLocations(CREDS, params)
    expect(calls).toEqual([{ path: '/v1/warehouse/list', body: {} }])
    expect(locations.map((l) => l.id)).toEqual(['1', '2'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('answers later pages with nothing, without re-fetching the same warehouses', async () => {
    const calls = fakeOzon(() => ({ result: [warehouse(1, 'A')] }))
    const params = withPageSink({ page: 2, limit: 50 })
    expect(await new OzonAdapter().listLocations(CREDS, params)).toEqual([])
    expect(calls).toHaveLength(0)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('gets one warehouse by id, and says so when it does not exist', async () => {
    fakeOzon(() => ({ result: [warehouse(1, 'A'), warehouse(2, 'B')] }))
    const adapter = new OzonAdapter()
    expect((await adapter.getLocation(CREDS, '2')).name).toBe('B')
    await expect(adapter.getLocation(CREDS, '999')).rejects.toThrow(/Ozon warehouse 999 not found/)
  })
})

describe('OzonAdapter inventory', () => {
  it('sets stock with the documented body and returns the level Ozon accepted', async () => {
    const calls = fakeOzon(() => ({
      result: [{ offer_id: 'KB-01', product_id: 214887921, warehouse_id: 18850503335000, updated: true, errors: [] }],
    }))
    const level = await new OzonAdapter().setInventoryLevel(CREDS, {
      variantId: 'KB-01',
      locationId: '18850503335000',
      available: 7,
    })
    expect(calls).toEqual([
      { path: '/v2/products/stocks', body: { stocks: [{ offer_id: 'KB-01', warehouse_id: 18850503335000, stock: 7 }] } },
    ])
    expect(level).toMatchObject({ id: 'KB-01:18850503335000', available: 7 })
  })

  it('fails loudly when Ozon returns no result row for the item', async () => {
    fakeOzon(() => ({ result: [] }))
    await expect(
      new OzonAdapter().setInventoryLevel(CREDS, { variantId: 'KB-01', locationId: '18850503335000', available: 7 }),
    ).rejects.toThrow(/no result for the stock update of KB-01/)
  })

  it('offers no delta adjustment — Ozon only sets absolute stock', () => {
    expect('adjustInventoryLevel' in new OzonAdapter()).toBe(false)
  })
})

describe('OzonAdapter orders', () => {
  it('gets a posting by posting number', async () => {
    const calls = fakeOzon(() => ({
      result: { posting_number: '05708065-0029-1', order_number: '05708065-0029', status: 'delivering', products: [] },
    }))
    const order = await new OzonAdapter().getOrder(CREDS, '05708065-0029-1')
    expect(calls).toEqual([{ path: '/v3/posting/fbs/get', body: { posting_number: '05708065-0029-1' } }])
    expect(order).toMatchObject({ id: '05708065-0029-1', fulfillmentStatus: 'FULFILLED' })
  })
})

describe('OzonAdapter declared-unavailable resources', () => {
  it('exposes no method for a resource metadata.ts declares unavailable', () => {
    const adapter = new OzonAdapter()
    for (const method of [
      'listCustomers',
      'getCustomer',
      'listCollections',
      'getCollection',
      'listDiscounts',
      'getDiscount',
    ]) {
      expect(method in adapter, method).toBe(false)
    }
  })
})
