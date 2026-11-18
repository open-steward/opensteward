import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShopifyInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/bold-commerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

describe('transformInventoryLevel (bold-commerce)', () => {
  const raw: RawShopifyInventoryLevel = {
    inventory_item_id: 1234,
    location_id: 5678,
    available: 42,
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('synthesises id as itemId:locationId', () => {
    expect(transformInventoryLevel(raw).id).toBe('1234:5678')
  })

  it('maps variantId to inventory_item_id string', () => {
    expect(transformInventoryLevel(raw).variantId).toBe('1234')
  })

  it('maps locationId to location_id string', () => {
    expect(transformInventoryLevel(raw).locationId).toBe('5678')
  })

  it('maps available quantity', () => {
    expect(transformInventoryLevel(raw).available).toBe(42)
  })

  it('defaults available to 0 when null', () => {
    expect(transformInventoryLevel({ ...raw, available: null }).available).toBe(0)
  })

  it('passes InventoryLevelSchema validation', () => {
    expect(() => InventoryLevelSchema.parse(transformInventoryLevel(raw))).not.toThrow()
  })

  it('handles string ids', () => {
    const strRaw: RawShopifyInventoryLevel = {
      inventory_item_id: 'abc',
      location_id: 'def',
      available: 5,
    }
    const result = transformInventoryLevel(strRaw)
    expect(result.id).toBe('abc:def')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
