import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawLightspeedItemShop,
} from '../../../../../../../src/verticals/ecommerce/adapters/lightspeed-retail/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeItemShop(overrides: Partial<RawLightspeedItemShop> = {}): RawLightspeedItemShop {
  return {
    itemShopID: '900',
    itemID: '501',
    shopID: '1',
    qoh: '42',
    reorderPoint: '10',
    reorderLevel: '50',
    timeStamp: '2024-03-15T08:30:00+00:00',
    ...overrides,
  }
}

describe('transformInventoryLevel (Lightspeed Retail)', () => {
  it('maps fields and synthesises composite id', () => {
    const result = transformInventoryLevel(makeItemShop())
    expect(result.id).toBe('501:1')
    expect(result.variantId).toBe('501')
    expect(result.locationId).toBe('1')
    expect(result.available).toBe(42)
    expect(result.updatedAt).toBe('2024-03-15T08:30:00+00:00')
  })

  it('parses decimal string quantity', () => {
    const result = transformInventoryLevel(makeItemShop({ qoh: '7.5' }))
    expect(result.available).toBe(7.5)
  })

  it('defaults undefined qoh to 0', () => {
    const result = transformInventoryLevel(makeItemShop({ qoh: undefined }))
    expect(result.available).toBe(0)
  })

  it('defaults empty string qoh to 0', () => {
    const result = transformInventoryLevel(makeItemShop({ qoh: '' }))
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeItemShop()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeItemShop())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
