import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShopifyInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopify/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeLevel(overrides: Partial<RawShopifyInventoryLevel> = {}): RawShopifyInventoryLevel {
  return {
    inventory_item_id: 501,
    location_id: 42,
    available: 17,
    updated_at: '2024-03-15T08:30:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('maps fields and synthesises the composite id', () => {
    const result = transformInventoryLevel(makeLevel())
    expect(result.id).toBe('501:42')
    expect(typeof result.id).toBe('string')
    expect(result.variantId).toBe('501')
    expect(result.locationId).toBe('42')
    expect(result.available).toBe(17)
    expect(result.updatedAt).toBe('2024-03-15T08:30:00Z')
  })

  it('defaults null available to 0', () => {
    const result = transformInventoryLevel(makeLevel({ available: null }))
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeLevel()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeLevel())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
