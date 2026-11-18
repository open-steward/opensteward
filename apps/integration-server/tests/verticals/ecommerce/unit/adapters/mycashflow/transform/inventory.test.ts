import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawMyCashflowStockItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/mycashflow/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(overrides: Partial<RawMyCashflowStockItem> = {}): RawMyCashflowStockItem {
  return {
    id: 777,
    product_id: 99,
    variation_id: 200,
    quantity: 50,
    reserved: 5,
    incoming: 20,
    location_id: 3,
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (MyCashflow)', () => {
  it('synthesises id as variantId:locationId', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.id).toBe('99:200:3')
  })

  it('maps variantId as productId:variationId composite', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.variantId).toBe('99:200')
  })

  it('falls back to productId only when no variation_id', () => {
    const result = transformInventoryLevel(makeRaw({ variation_id: null }))
    expect(result.variantId).toBe('99')
    expect(result.id).toBe('99:3')
  })

  it('maps location_id to locationId', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.locationId).toBe('3')
  })

  it('defaults locationId to "default" when location_id is null', () => {
    const result = transformInventoryLevel(makeRaw({ location_id: null }))
    expect(result.locationId).toBe('default')
  })

  it('maps quantity to available', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.available).toBe(50)
  })

  it('maps reserved to committed', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.committed).toBe(5)
  })

  it('maps incoming to incoming', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.incoming).toBe(20)
  })

  it('computes onHand as available + committed', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.onHand).toBe(55)
  })

  it('maps updated_at to updatedAt', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
