import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShopifyInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/jimdo/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

describe('transformInventoryLevel (jimdo)', () => {
  const raw: RawShopifyInventoryLevel = {
    inventory_item_id: 444,
    location_id: 555,
    available: 42,
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('synthesises a composite id as itemId:locationId', () => {
    const result = transformInventoryLevel(raw)
    expect(result.id).toBe('444:555')
  })

  it('maps variantId from inventory_item_id (string coercion)', () => {
    const result = transformInventoryLevel(raw)
    expect(result.variantId).toBe('444')
  })

  it('maps locationId to string', () => {
    const result = transformInventoryLevel(raw)
    expect(result.locationId).toBe('555')
  })

  it('maps available quantity', () => {
    const result = transformInventoryLevel(raw)
    expect(result.available).toBe(42)
  })

  it('defaults available to 0 when null', () => {
    const result = transformInventoryLevel({ ...raw, available: null })
    expect(result.available).toBe(0)
  })

  it('produces schema-valid output', () => {
    const result = transformInventoryLevel(raw)
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
