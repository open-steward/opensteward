import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawYokartSellerProductStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/yokart/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(
  overrides: Partial<RawYokartSellerProductStock> = {},
): RawYokartSellerProductStock {
  return {
    selprod_id: 99,
    selprod_stock: 25,
    selprod_min_order_qty: 1,
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('maps selprod_id to variantId', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.variantId).toBe('99')
  })

  it('sets id as variantId:default', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.id).toBe('99:default')
  })

  it('sets locationId to "default"', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.locationId).toBe('default')
  })

  it('maps selprod_stock to available count', () => {
    const result = transformInventoryLevel(makeStock({ selprod_stock: 25 }))
    expect(result.available).toBe(25)
  })

  it('parses selprod_stock from string', () => {
    const result = transformInventoryLevel(makeStock({ selprod_stock: '42' }))
    expect(result.available).toBe(42)
  })

  it('defaults available to 0 when selprod_stock is null', () => {
    const result = transformInventoryLevel(makeStock({ selprod_stock: null }))
    expect(result.available).toBe(0)
  })

  it('defaults available to 0 when selprod_stock is undefined', () => {
    const result = transformInventoryLevel(makeStock({ selprod_stock: undefined }))
    expect(result.available).toBe(0)
  })

  it('defaults available to 0 when selprod_stock is NaN string', () => {
    const result = transformInventoryLevel(makeStock({ selprod_stock: 'N/A' }))
    expect(result.available).toBe(0)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
