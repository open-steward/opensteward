import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawCentraStockItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/centra/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStockItem(overrides: Partial<RawCentraStockItem> = {}): RawCentraStockItem {
  return {
    sku: 'SHIRT-XL-BLUE',
    productId: 201,
    variantId: 301,
    stockItemId: 4001,
    physicalStock: 100,
    allocatedStock: 5,
    availableStock: 95,
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('synthesises id as "stockItemId:locationId"', () => {
    const result = transformInventoryLevel(makeStockItem())
    expect(result.id).toBe('4001:default')
  })

  it('uses stockItemId as variantId (most granular)', () => {
    const result = transformInventoryLevel(makeStockItem())
    expect(result.variantId).toBe('4001')
  })

  it('falls back to variantId when stockItemId absent', () => {
    const result = transformInventoryLevel(makeStockItem({ stockItemId: undefined }))
    expect(result.variantId).toBe('301')
    expect(result.id).toBe('301:default')
  })

  it('uses "default" as locationId when not provided', () => {
    const result = transformInventoryLevel(makeStockItem())
    expect(result.locationId).toBe('default')
  })

  it('accepts custom locationId argument', () => {
    const result = transformInventoryLevel(makeStockItem(), 'warehouse-1')
    expect(result.locationId).toBe('warehouse-1')
    expect(result.id).toBe('4001:warehouse-1')
  })

  it('maps availableStock to available', () => {
    const result = transformInventoryLevel(makeStockItem())
    expect(result.available).toBe(95)
  })

  it('defaults available to 0 when availableStock is absent', () => {
    const result = transformInventoryLevel(makeStockItem({ availableStock: undefined }))
    expect(result.available).toBe(0)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStockItem())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
