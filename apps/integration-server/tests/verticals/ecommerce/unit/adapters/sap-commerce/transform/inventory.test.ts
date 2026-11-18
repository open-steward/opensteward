import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  untransformInventoryLevel,
  type RawSapStockLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/sap-commerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStockLevel(overrides: Partial<RawSapStockLevel> = {}): RawSapStockLevel {
  return {
    productCode: 'HW-1234',
    warehouseCode: 'warehouse-munich-01',
    available: 42,
    reserved: 5,
    stockLevel: 42,
    stockLevelStatus: 'inStock',
    ...overrides,
  }
}

describe('transformInventoryLevel (sap-commerce)', () => {
  it('maps core fields', () => {
    const r = transformInventoryLevel(makeStockLevel())
    expect(r.variantId).toBe('HW-1234')
    expect(r.locationId).toBe('warehouse-munich-01')
    expect(r.available).toBe(42)
  })

  it('synthesizes id from productCode:warehouseCode', () => {
    const r = transformInventoryLevel(makeStockLevel())
    expect(r.id).toBe('HW-1234:warehouse-munich-01')
  })

  it('maps committed from reserved', () => {
    const r = transformInventoryLevel(makeStockLevel())
    expect(r.committed).toBe(5)
  })

  it('computes onHand as available + reserved', () => {
    const r = transformInventoryLevel(makeStockLevel())
    expect(r.onHand).toBe(47)
  })

  it('defaults to stockLevel when available is absent', () => {
    const r = transformInventoryLevel(makeStockLevel({ available: undefined, stockLevel: 30 }))
    expect(r.available).toBe(30)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStockLevel()
    const r = transformInventoryLevel(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const r = transformInventoryLevel(makeStockLevel())
    expect(() => InventoryLevelSchema.parse(r)).not.toThrow()
  })
})

describe('untransformInventoryLevel (sap-commerce)', () => {
  it('builds body from canonical data', () => {
    const body = untransformInventoryLevel({
      variantId: 'HW-5678',
      locationId: 'warehouse-01',
      available: 100,
    }) as Record<string, unknown>
    expect(body['productCode']).toBe('HW-5678')
    expect(body['warehouseCode']).toBe('warehouse-01')
    expect(body['available']).toBe(100)
  })
})
