import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShopwareProductStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeProductStock(
  overrides: Partial<RawShopwareProductStock> = {},
): RawShopwareProductStock {
  return {
    id: 'prod-abc123',
    productNumber: 'SW-1001',
    stock: 50,
    availableStock: 45,
    ...overrides,
  }
}

describe('transformInventoryLevel (Shopware)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeProductStock())
    expect(result.id).toBe('prod-abc123:default')
    expect(result.variantId).toBe('prod-abc123')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(45)
    expect(result.onHand).toBe(50)
  })

  it('uses stock when availableStock is missing', () => {
    const result = transformInventoryLevel(
      makeProductStock({ availableStock: undefined }),
    )
    expect(result.available).toBe(50)
  })

  it('defaults to 0 when both stock fields missing', () => {
    const result = transformInventoryLevel(
      makeProductStock({ stock: undefined, availableStock: undefined }),
    )
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProductStock()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('validates against InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeProductStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
