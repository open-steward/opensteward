import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  untransformInventoryLevel,
  type RawWayfairInventoryItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/wayfair/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeItem(overrides: Partial<RawWayfairInventoryItem> = {}): RawWayfairInventoryItem {
  return {
    supplierPartNumber: 'WF-CHAIR-001',
    quantityOnHand: 42,
    supplierId: 'sup-99',
    warehouseId: 'wh-east-1',
    ...overrides,
  }
}

describe('transformInventoryLevel (Wayfair)', () => {
  it('synthesises id as <variantId>:<locationId>', () => {
    const result = transformInventoryLevel(makeItem(), 'loc-123')
    expect(result.id).toBe('WF-CHAIR-001:loc-123')
  })

  it('maps supplierPartNumber to variantId', () => {
    const result = transformInventoryLevel(makeItem())
    expect(result.variantId).toBe('WF-CHAIR-001')
  })

  it('uses explicit locationId param when provided', () => {
    const result = transformInventoryLevel(makeItem(), 'override-loc')
    expect(result.locationId).toBe('override-loc')
  })

  it('falls back to supplierId when locationId param is absent', () => {
    const result = transformInventoryLevel(makeItem({ warehouseId: null }))
    expect(result.locationId).toBe('sup-99')
  })

  it('falls back to warehouseId when both locationId param and supplierId are absent', () => {
    const result = transformInventoryLevel(makeItem({ supplierId: null }))
    expect(result.locationId).toBe('wh-east-1')
  })

  it('falls back to "default" when all location sources are absent', () => {
    const result = transformInventoryLevel(makeItem({ supplierId: null, warehouseId: null }))
    expect(result.locationId).toBe('default')
  })

  it('clamps negative quantityOnHand to 0 for available', () => {
    const result = transformInventoryLevel(makeItem({ quantityOnHand: -5 }))
    expect(result.available).toBe(0)
    expect(result.onHand).toBe(0)
  })

  it('maps positive quantityOnHand to both available and onHand', () => {
    const result = transformInventoryLevel(makeItem({ quantityOnHand: 42 }))
    expect(result.available).toBe(42)
    expect(result.onHand).toBe(42)
  })

  it('stores raw item in metadata', () => {
    const item = makeItem()
    const result = transformInventoryLevel(item)
    expect(result.metadata).toBe(item)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeItem(), 'loc-123')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('round-trips through untransformInventoryLevel', () => {
    const item = makeItem()
    const canonical = transformInventoryLevel(item, 'loc-123')
    const back = untransformInventoryLevel(canonical)
    expect(back.supplierPartNumber).toBe(canonical.variantId)
    expect(back.quantityOnHand).toBe(canonical.available)
  })
})
