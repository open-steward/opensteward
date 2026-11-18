import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawLoyverseInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/loyverse/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(overrides: Partial<RawLoyverseInventoryLevel> = {}): RawLoyverseInventoryLevel {
  return {
    variant_id: 'var_abc',
    store_id: 'store_xyz',
    in_stock: 10,
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Loyverse)', () => {
  it('synthesizes id as variant_id:store_id', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.id).toBe('var_abc:store_xyz')
  })

  it('maps variantId and locationId', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.variantId).toBe('var_abc')
    expect(result.locationId).toBe('store_xyz')
  })

  it('rounds float in_stock to integer', () => {
    const result = transformInventoryLevel(makeRaw({ in_stock: 4.7 }))
    expect(result.available).toBe(5)
    expect(result.onHand).toBe(5)
  })

  it('maps integer in_stock directly', () => {
    const result = transformInventoryLevel(makeRaw({ in_stock: 10 }))
    expect(result.available).toBe(10)
    expect(result.onHand).toBe(10)
  })

  it('defaults to 0 when in_stock is null', () => {
    const result = transformInventoryLevel(makeRaw({ in_stock: null }))
    expect(result.available).toBe(0)
    expect(result.onHand).toBe(0)
  })

  it('defaults to 0 when in_stock is undefined', () => {
    const result = transformInventoryLevel(makeRaw({ in_stock: undefined }))
    expect(result.available).toBe(0)
    expect(result.onHand).toBe(0)
  })

  it('clamps negative in_stock to 0', () => {
    const result = transformInventoryLevel(makeRaw({ in_stock: -3 }))
    expect(result.available).toBe(0)
    expect(result.onHand).toBe(0)
  })

  it('maps updatedAt', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('produces schema-valid output', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output with minimal input', () => {
    const result = transformInventoryLevel(makeRaw({ in_stock: undefined, updated_at: undefined }))
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
