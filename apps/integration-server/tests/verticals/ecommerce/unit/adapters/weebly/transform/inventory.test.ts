import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShopifyInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/weebly/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventoryLevel(
  overrides: Partial<RawShopifyInventoryLevel> = {},
): RawShopifyInventoryLevel {
  return {
    inventory_item_id: 333,
    location_id: 444,
    available: 50,
    updated_at: '2024-05-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('synthesises a composite id from inventory_item_id and location_id', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(result.id).toBe('333:444')
  })

  it('sets variantId to the stringified inventory_item_id', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(result.variantId).toBe('333')
    expect(typeof result.variantId).toBe('string')
  })

  it('maps locationId as a string', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(result.locationId).toBe('444')
    expect(typeof result.locationId).toBe('string')
  })

  it('maps available quantity', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(result.available).toBe(50)
  })

  it('defaults available to 0 when null', () => {
    const result = transformInventoryLevel(makeInventoryLevel({ available: null }))
    expect(result.available).toBe(0)
  })

  it('maps updatedAt', () => {
    const result = transformInventoryLevel(makeInventoryLevel())
    expect(result.updatedAt).toBe('2024-05-01T10:00:00.000Z')
  })

  it('handles string inventory_item_id and location_id', () => {
    const result = transformInventoryLevel(
      makeInventoryLevel({ inventory_item_id: '999', location_id: '888' }),
    )
    expect(result.id).toBe('999:888')
    expect(result.variantId).toBe('999')
    expect(result.locationId).toBe('888')
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
