import { describe, it, expect } from 'vitest'
import {
  transformInventoryItem,
  type RawWixInventoryItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/wix/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventoryItem(overrides: Partial<RawWixInventoryItem> = {}): RawWixInventoryItem {
  return {
    id: 'inv-001',
    productId: 'prod-001',
    trackQuantity: true,
    variants: [
      { variantId: 'var-001', inStock: true, quantity: 25 },
      { variantId: 'var-002', inStock: false, quantity: 0 },
    ],
    lastUpdated: '2024-03-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryItem', () => {
  it('creates one inventory level per variant', () => {
    const result = transformInventoryItem(makeInventoryItem())
    expect(result).toHaveLength(2)
    expect(result[0]!.variantId).toBe('var-001')
    expect(result[0]!.available).toBe(25)
    expect(result[1]!.variantId).toBe('var-002')
    expect(result[1]!.available).toBe(0)
  })

  it('synthesises id as variantId:locationId', () => {
    const result = transformInventoryItem(makeInventoryItem())
    expect(result[0]!.id).toBe('var-001:default')
    expect(result[0]!.locationId).toBe('default')
  })

  it('uses custom location id when provided', () => {
    const result = transformInventoryItem(makeInventoryItem(), 'warehouse-1')
    expect(result[0]!.id).toBe('var-001:warehouse-1')
    expect(result[0]!.locationId).toBe('warehouse-1')
  })

  it('handles items with no variants', () => {
    const result = transformInventoryItem(makeInventoryItem({ variants: [] }))
    expect(result).toHaveLength(1)
    expect(result[0]!.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeInventoryItem()
    const result = transformInventoryItem(raw)
    expect(result[0]!.metadata).toBe(raw)
  })

  it('produces payloads that satisfy InventoryLevelSchema', () => {
    const results = transformInventoryItem(makeInventoryItem())
    for (const result of results) {
      expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
    }
  })
})
