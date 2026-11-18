/**
 * listStockLevels fans out one stock request per product. Swallowing a per-product
 * failure to [] silently under-reports stock: the sync worker records a successful
 * "synced N levels" that is missing the products whose stock call failed, and an
 * operator reading the result cannot tell "this product has no stock" from
 * "we could not read this product's stock".
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { XentralAdapter } from '../../../../../src/verticals/inventory/adapters/xentral'
import { XentralClient } from '../../../../../src/verticals/inventory/adapters/xentral/client'

const creds = { accessToken: 'tok', extra: { xentralId: 'acme' } } as Credentials

function httpError(status: number): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: {} },
  })
}

afterEach(() => vi.restoreAllMocks())

describe('Xentral listStockLevels', () => {
  it('propagates a per-product 500 instead of dropping that product silently', async () => {
    vi.spyOn(XentralClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path === '/api/v1/products') return { data: [{ id: 'p1' }, { id: 'p2' }] } as never
      if (path === '/api/v1/products/p1/stocks') return { data: {} } as never
      throw httpError(500)
    })
    await expect(new XentralAdapter().listStockLevels(creds, {})).rejects.toThrow()
  })

  it('treats a per-product 404 as "no stock records for this product"', async () => {
    vi.spyOn(XentralClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path === '/api/v1/products') return { data: [{ id: 'p1' }] } as never
      throw httpError(404)
    })
    await expect(new XentralAdapter().listStockLevels(creds, {})).resolves.toEqual([])
  })
})
