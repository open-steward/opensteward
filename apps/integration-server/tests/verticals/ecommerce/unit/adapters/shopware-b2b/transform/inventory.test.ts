import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShopwareProductStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware-b2b/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawShopwareProductStock> = {}): RawShopwareProductStock {
  return {
    id: 'prod-b2b-001',
    productNumber: 'B2B-SW-1001',
    stock: 500,
    availableStock: 480,
    ...overrides,
  }
}

describe('transformInventoryLevel (Shopware B2B)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.id).toBe('prod-b2b-001:default')
    expect(result.variantId).toBe('prod-b2b-001')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(480)
    expect(result.onHand).toBe(500)
  })

  it('uses stock when availableStock is missing', () => {
    const result = transformInventoryLevel(makeStock({ availableStock: undefined }))
    expect(result.available).toBe(500)
  })

  it('defaults to 0 when both are missing', () => {
    const result = transformInventoryLevel(makeStock({ stock: undefined, availableStock: undefined }))
    expect(result.available).toBe(0)
    expect(result.onHand).toBeUndefined()
  })

  it('preserves metadata and validates', () => {
    const raw = makeStock()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
