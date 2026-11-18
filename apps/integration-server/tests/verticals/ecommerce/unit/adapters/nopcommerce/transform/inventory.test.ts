import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  transformCombinationInventoryLevel,
  type RawNopProductStock,
  type RawNopCombinationStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/nopcommerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

describe('transformInventoryLevel (nopCommerce)', () => {
  it('maps product stock to canonical inventory level', () => {
    const raw: RawNopProductStock = {
      id: 100,
      stock_quantity: 42,
      manage_inventory_method_id: 1,
      updated_on_utc: '2024-03-01T10:00:00Z',
    }
    const result = transformInventoryLevel(raw, '100')
    expect(result.id).toBe('100:100:default')
    expect(result.variantId).toBe('100:100')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(42)
    expect(result.updatedAt).toBe('2024-03-01T10:00:00Z')
  })

  it('defaults to 0 when stock_quantity is null', () => {
    const raw: RawNopProductStock = {
      id: 200,
      stock_quantity: null,
    }
    const result = transformInventoryLevel(raw, '100')
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw: RawNopProductStock = { id: 100, stock_quantity: 10 }
    const result = transformInventoryLevel(raw, '100')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const raw: RawNopProductStock = { id: 100, stock_quantity: 10 }
    const result = transformInventoryLevel(raw, '100')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformCombinationInventoryLevel (nopCommerce)', () => {
  it('maps attribute combination stock to canonical inventory level', () => {
    const raw: RawNopCombinationStock = {
      id: 501,
      product_id: 100,
      stock_quantity: 15,
    }
    const result = transformCombinationInventoryLevel(raw, '100')
    expect(result.id).toBe('100:501:default')
    expect(result.variantId).toBe('100:501')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(15)
  })
})
