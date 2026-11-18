import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShopifyInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventoryLevel(
  overrides: Partial<RawShopifyInventoryLevel> = {},
): RawShopifyInventoryLevel {
  return {
    inventory_item_id: 12345,
    location_id: 99,
    available: 10,
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (GoDaddy Websites + Commerce / Shopify shapes)', () => {
  it('synthesises id from inventory_item_id and location_id', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(result.id).toBe('12345:99')
    expect(result.variantId).toBe('12345')
    expect(result.locationId).toBe('99')
  })

  it('maps available count', () => {
    const result = transformInventoryLevel(makeInventoryLevel({ available: 42 }))
    expect(result.available).toBe(42)
  })

  it('defaults available to 0 when null', () => {
    const result = transformInventoryLevel(makeInventoryLevel({ available: null }))
    expect(result.available).toBe(0)
  })

  it('maps updatedAt timestamp', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeInventoryLevel()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
