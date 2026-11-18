import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawJumiaStockItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/jumia/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawJumiaStockItem> = {}): RawJumiaStockItem {
  return {
    sku_id: 'SKU-9001',
    seller_sku: 'EARBUDS-BLK',
    product_id: '987654',
    available_quantity: 150,
    reserved_quantity: 20,
    ...overrides,
  }
}

describe('transformInventoryLevel (Jumia)', () => {
  it('uses sku_id as the variantId', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.variantId).toBe('SKU-9001')
  })

  it('synthesizes id as variantId:jumia-default', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.id).toBe('SKU-9001:jumia-default')
    expect(result.locationId).toBe('jumia-default')
  })

  it('maps available_quantity to available', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.available).toBe(150)
  })

  it('maps reserved_quantity to committed', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.committed).toBe(20)
  })

  it('calculates onHand as available + committed', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.onHand).toBe(170)
  })

  it('handles missing reserved_quantity', () => {
    const result = transformInventoryLevel(makeStock({ reserved_quantity: undefined }))
    expect(result.committed).toBeUndefined()
    expect(result.onHand).toBeUndefined()
  })

  it('falls back to quantity if available_quantity is missing', () => {
    const result = transformInventoryLevel(
      makeStock({ available_quantity: undefined, quantity: 42 }),
    )
    expect(result.available).toBe(42)
  })

  it('falls back to seller_sku if sku_id is missing', () => {
    const result = transformInventoryLevel(makeStock({ sku_id: undefined }))
    expect(result.variantId).toBe('EARBUDS-BLK')
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('preserves raw payload in metadata', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.metadata['sku_id']).toBe('SKU-9001')
    expect(result.metadata['product_id']).toBe('987654')
  })
})
