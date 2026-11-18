import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShoperProductStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoper/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(overrides: Partial<RawShoperProductStock> = {}): RawShoperProductStock {
  return {
    product_id: 701,
    stock: 25,
    warehouse_id: 801,
    edit_date: '2024-04-01T07:00:00.000Z',
    ...overrides,
  }
}

describe('shoper transformInventoryLevel', () => {
  it('synthesises id as productId:warehouseId', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.id).toBe('701:801')
  })

  it('sets variantId to the product_id string', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.variantId).toBe('701')
  })

  it('maps locationId from warehouse_id', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.locationId).toBe('801')
  })

  it('uses provided warehouseId arg over raw warehouse_id', () => {
    const result = transformInventoryLevel(makeRaw(), 'custom-warehouse')
    expect(result.locationId).toBe('custom-warehouse')
    expect(result.id).toBe('701:custom-warehouse')
  })

  it('defaults locationId to "default" when warehouse_id is absent', () => {
    const result = transformInventoryLevel(makeRaw({ warehouse_id: null }))
    expect(result.locationId).toBe('default')
  })

  it('clamps negative stock to 0', () => {
    const result = transformInventoryLevel(makeRaw({ stock: -5 }))
    expect(result.available).toBe(0)
  })

  it('maps stock to available', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.available).toBe(25)
  })

  it('produces output that passes InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
