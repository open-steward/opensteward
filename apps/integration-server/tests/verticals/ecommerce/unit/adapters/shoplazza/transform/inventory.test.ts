import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShoplazzaInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoplazza/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(overrides: Partial<RawShoplazzaInventoryLevel> = {}): RawShoplazzaInventoryLevel {
  return {
    inventory_item_id: 7001,
    variant_id: 8001,
    location_id: 9001,
    available: 50,
    updated_at: '2024-05-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('shoplazza transformInventoryLevel', () => {
  it('prefers inventory_item_id as variantId over variant_id', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.variantId).toBe('7001')
  })

  it('falls back to variant_id when inventory_item_id is absent', () => {
    const result = transformInventoryLevel(makeRaw({ inventory_item_id: null }))
    expect(result.variantId).toBe('8001')
  })

  it('falls back to "unknown" when both ids are absent', () => {
    const result = transformInventoryLevel(makeRaw({ inventory_item_id: null, variant_id: null }))
    expect(result.variantId).toBe('unknown')
  })

  it('synthesises id as itemId:locationId', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.id).toBe('7001:9001')
  })

  it('maps location_id to locationId', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.locationId).toBe('9001')
  })

  it('maps available quantity', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.available).toBe(50)
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
