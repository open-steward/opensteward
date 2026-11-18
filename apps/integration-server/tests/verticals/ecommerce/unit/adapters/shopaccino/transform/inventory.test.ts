import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShopifyInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopaccino/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(overrides: Partial<RawShopifyInventoryLevel> = {}): RawShopifyInventoryLevel {
  return {
    inventory_item_id: 3001,
    location_id: 4001,
    available: 42,
    updated_at: '2024-05-10T12:00:00.000Z',
    ...overrides,
  }
}

describe('shopaccino transformInventoryLevel', () => {
  it('synthesises id as inventory_item_id:location_id', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.id).toBe('3001:4001')
  })

  it('sets variantId to the inventory_item_id string', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.variantId).toBe('3001')
  })

  it('maps locationId to string', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.locationId).toBe('4001')
  })

  it('carries available quantity', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.available).toBe(42)
  })

  it('defaults available to 0 when null', () => {
    const result = transformInventoryLevel(makeRaw({ available: null }))
    expect(result.available).toBe(0)
  })

  it('produces output that passes InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
