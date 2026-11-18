import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShopifyInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

describe('transformInventoryLevel (loja-integrada / Shopify)', () => {
  it('synthesises id as inventory_item_id:location_id', () => {
    const raw: RawShopifyInventoryLevel = {
      inventory_item_id: 3001,
      location_id: 7001,
      available: 42,
      updated_at: '2024-04-01T08:00:00Z',
    }
    const result = transformInventoryLevel(raw)
    expect(result.id).toBe('3001:7001')
  })

  it('maps variantId from inventory_item_id (Shopify-specific convention)', () => {
    const raw: RawShopifyInventoryLevel = {
      inventory_item_id: 3001,
      location_id: 7001,
      available: 42,
    }
    const result = transformInventoryLevel(raw)
    expect(result.variantId).toBe('3001')
  })

  it('maps locationId and available', () => {
    const raw: RawShopifyInventoryLevel = {
      inventory_item_id: 3002,
      location_id: 7002,
      available: 10,
      updated_at: '2024-05-15T12:00:00Z',
    }
    const result = transformInventoryLevel(raw)
    expect(result.locationId).toBe('7002')
    expect(result.available).toBe(10)
    expect(result.updatedAt).toBe('2024-05-15T12:00:00Z')
  })

  it('maps null available to 0', () => {
    const raw: RawShopifyInventoryLevel = {
      inventory_item_id: 3003,
      location_id: 7003,
      available: null,
    }
    const result = transformInventoryLevel(raw)
    expect(result.available).toBe(0)
  })

  it('handles string ids correctly', () => {
    const raw: RawShopifyInventoryLevel = {
      inventory_item_id: 'item-abc',
      location_id: 'loc-xyz',
      available: 5,
    }
    const result = transformInventoryLevel(raw)
    expect(result.id).toBe('item-abc:loc-xyz')
    expect(result.variantId).toBe('item-abc')
    expect(result.locationId).toBe('loc-xyz')
  })

  it('preserves raw in metadata', () => {
    const raw: RawShopifyInventoryLevel = {
      inventory_item_id: 3004,
      location_id: 7004,
      available: 0,
    }
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const raw: RawShopifyInventoryLevel = {
      inventory_item_id: 3005,
      location_id: 7005,
      available: 25,
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInventoryLevel(raw)
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
