import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShopifyInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/sellfy/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventoryLevel(
  overrides: Partial<RawShopifyInventoryLevel> = {},
): RawShopifyInventoryLevel {
  return {
    inventory_item_id: 100,
    location_id: 200,
    available: 5,
    updated_at: '2024-06-01T11:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('synthesises composite id from inventory_item_id and location_id', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(result.id).toBe('100:200')
    expect(typeof result.id).toBe('string')
  })

  it('sets variantId to stringified inventory_item_id', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(result.variantId).toBe('100')
  })

  it('sets locationId to stringified location_id', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(result.locationId).toBe('200')
  })

  it('maps available quantity', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(result.available).toBe(5)
  })

  it('defaults available to 0 when null', () => {
    const result = transformInventoryLevel(makeInventoryLevel({ available: null }))
    expect(result.available).toBe(0)
  })

  it('maps updatedAt date', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(result.updatedAt).toBe('2024-06-01T11:00:00Z')
  })

  it('handles large numeric ids correctly', () => {
    const result = transformInventoryLevel(
      makeInventoryLevel({ inventory_item_id: 9999999, location_id: 8888888 }),
    )
    expect(result.id).toBe('9999999:8888888')
    expect(result.variantId).toBe('9999999')
    expect(result.locationId).toBe('8888888')
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

  it('produces a valid schema payload with zero available', () => {
    const result = transformInventoryLevel(makeInventoryLevel({ available: 0 }))
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
    expect(result.available).toBe(0)
  })
})
