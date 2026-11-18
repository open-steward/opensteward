import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShopifyInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeLevel(overrides: Partial<RawShopifyInventoryLevel> = {}): RawShopifyInventoryLevel {
  return {
    inventory_item_id: 1001,
    location_id: 2001,
    available: 25,
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (logicommerce / Shopify)', () => {
  it('synthesises id as inventory_item_id:location_id', () => {
    const result = transformInventoryLevel(makeLevel())
    expect(result.id).toBe('1001:2001')
  })

  it('maps inventory_item_id to variantId', () => {
    const result = transformInventoryLevel(makeLevel())
    expect(result.variantId).toBe('1001')
  })

  it('maps location_id to locationId', () => {
    const result = transformInventoryLevel(makeLevel())
    expect(result.locationId).toBe('2001')
  })

  it('maps available', () => {
    const result = transformInventoryLevel(makeLevel({ available: 99 }))
    expect(result.available).toBe(99)
  })

  it('defaults available to 0 when null', () => {
    const result = transformInventoryLevel(makeLevel({ available: null }))
    expect(result.available).toBe(0)
  })

  it('maps updated_at to updatedAt', () => {
    const result = transformInventoryLevel(makeLevel())
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('stores raw payload in metadata', () => {
    const raw = makeLevel()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeLevel())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
