/**
 * Ozon stock write → canonical InventoryLevel.
 *
 * Source: `POST /v2/products/stocks` (Prices&StocksAPI). Request
 * `{ stocks: [{ offer_id, product_id, stock, warehouse_id }] }`; response
 * `{ result: [{ offer_id, product_id, warehouse_id, updated, errors: [{ code, message }] }] }`.
 * `stock` is the quantity to SET on that warehouse — there is no delta
 * method, which is why the adapter implements `setInventoryLevel` only.
 * Up to 100 items per request, 80 requests/minute, one update per warehouse
 * per 2 minutes (otherwise `TOO_MANY_REQUESTS`).
 * Official spec: https://docs.ozon.ru/api/seller/
 *   https://web.archive.org/web/20240531073337/https://docs.ozon.ru/api/seller/swagger.json
 * Path confirmed live 2026-09-13; its predecessor `/v1/product/import/stocks`
 * now answers 404.
 */
import { describe, it, expect } from 'vitest'
import {
  toStockUpdateBody,
  transformStockUpdate,
  type RawOzonStockUpdateResult,
} from '../../../../../../../src/verticals/ecommerce/adapters/ozon/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeResult(overrides: Partial<RawOzonStockUpdateResult> = {}): RawOzonStockUpdateResult {
  return {
    offer_id: 'KB-01',
    product_id: 214887921,
    warehouse_id: 18850503335000,
    updated: true,
    errors: [],
    ...overrides,
  }
}

describe('ozon toStockUpdateBody', () => {
  it('builds the documented single-item request body', () => {
    expect(toStockUpdateBody('KB-01', '18850503335000', 7)).toEqual({
      stocks: [{ offer_id: 'KB-01', warehouse_id: 18850503335000, stock: 7 }],
    })
  })

  it('rejects a location id that is not an Ozon warehouse id', () => {
    expect(() => toStockUpdateBody('KB-01', 'ozon-default', 7)).toThrow(/warehouse id/i)
  })

  it('rejects a negative or fractional quantity', () => {
    expect(() => toStockUpdateBody('KB-01', '18850503335000', -1)).toThrow(/non-negative integer/i)
    expect(() => toStockUpdateBody('KB-01', '18850503335000', 1.5)).toThrow(/non-negative integer/i)
  })
})

describe('ozon transformStockUpdate', () => {
  it('maps an accepted update to the level that was set', () => {
    const raw = makeResult()
    const level = transformStockUpdate(raw, 7)
    expect(level).toEqual({
      id: 'KB-01:18850503335000',
      variantId: 'KB-01',
      locationId: '18850503335000',
      available: 7,
      metadata: raw,
    })
  })

  it('throws with Ozon’s own error codes when the update was not applied', () => {
    const raw = makeResult({
      updated: false,
      errors: [{ code: 'TOO_MANY_REQUESTS', message: 'too many requests' }],
    })
    expect(() => transformStockUpdate(raw, 7)).toThrow(/Ozon rejected the stock update.*TOO_MANY_REQUESTS/)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const parsed = InventoryLevelSchema.parse(transformStockUpdate(makeResult(), 7))
    expect(parsed.available).toBe(7)
  })
})
