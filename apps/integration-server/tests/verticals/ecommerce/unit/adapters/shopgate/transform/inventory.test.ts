import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShopgateInventory,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopgate/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(overrides: Partial<RawShopgateInventory> = {}): RawShopgateInventory {
  return {
    productCode: 'PROD-001',
    variantCode: 'VAR-S',
    locationCode: 'WH-WEST',
    available: 15,
    onHand: 20,
    updatedAt: '2024-05-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('shopgate transformInventoryLevel', () => {
  it('prefers variantCode over productCode for variantId', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.variantId).toBe('VAR-S')
  })

  it('falls back to productCode when variantCode is absent', () => {
    const result = transformInventoryLevel(makeRaw({ variantCode: null }))
    expect(result.variantId).toBe('PROD-001')
  })

  it('synthesises id as variantId:locationCode', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.id).toBe('VAR-S:WH-WEST')
  })

  it('maps locationCode to locationId', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.locationId).toBe('WH-WEST')
  })

  it('uses available over onHand when available is set', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.available).toBe(15)
  })

  it('falls back to onHand when available is null', () => {
    const result = transformInventoryLevel(makeRaw({ available: null }))
    expect(result.available).toBe(20)
  })

  it('defaults to 0 when both available and onHand are null', () => {
    const result = transformInventoryLevel(makeRaw({ available: null, onHand: null }))
    expect(result.available).toBe(0)
  })

  it('produces output that passes InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
