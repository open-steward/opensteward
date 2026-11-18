import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawBCInventoryItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/bettercommerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeItem(overrides: Partial<RawBCInventoryItem> = {}): RawBCInventoryItem {
  return {
    recordId: 'inv-001',
    productId: 'prod-100',
    stockCode: 'SKU-001',
    currentStock: 50,
    locationId: 'loc-001',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (BetterCommerce)', () => {
  it('synthesises id as variantId:locationId', () => {
    const result = transformInventoryLevel(makeItem({ recordId: 'inv-001', locationId: 'loc-001' }))
    expect(result.id).toBe('inv-001:loc-001')
  })

  it('maps recordId to variantId', () => {
    const result = transformInventoryLevel(makeItem({ recordId: 'inv-001' }))
    expect(result.variantId).toBe('inv-001')
  })

  it('falls back to productId when recordId is absent', () => {
    const result = transformInventoryLevel(makeItem({ recordId: undefined, productId: 'prod-100' }))
    expect(result.variantId).toBe('prod-100')
  })

  it('uses raw locationId when present', () => {
    const result = transformInventoryLevel(makeItem({ locationId: 'loc-001' }))
    expect(result.locationId).toBe('loc-001')
  })

  it('defaults locationId to "default" when absent', () => {
    const result = transformInventoryLevel(makeItem({ locationId: null }))
    expect(result.locationId).toBe('default')
  })

  it('maps currentStock to available', () => {
    const result = transformInventoryLevel(makeItem({ currentStock: 50 }))
    expect(result.available).toBe(50)
  })

  it('uses 0 when currentStock is null', () => {
    const result = transformInventoryLevel(makeItem({ currentStock: null }))
    expect(result.available).toBe(0)
  })

  it('maps updatedAt', () => {
    const result = transformInventoryLevel(makeItem())
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeItem()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeItem())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
