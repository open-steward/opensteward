import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawBagyVariantStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/bagy/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeVariantStock(overrides: Partial<RawBagyVariantStock> = {}): RawBagyVariantStock {
  return {
    id: 50,
    product_id: 10,
    stock: 30,
    minimum_stock: 5,
    modified: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Bagy)', () => {
  it('synthesises id as variantId:default', () => {
    const result = transformInventoryLevel(makeVariantStock({ id: 50 }))
    expect(result.id).toBe('50:default')
  })

  it('maps variantId from id', () => {
    const result = transformInventoryLevel(makeVariantStock({ id: 50 }))
    expect(result.variantId).toBe('50')
  })

  it('hardcodes locationId to "default"', () => {
    const result = transformInventoryLevel(makeVariantStock())
    expect(result.locationId).toBe('default')
  })

  it('maps stock to available', () => {
    const result = transformInventoryLevel(makeVariantStock({ stock: 30 }))
    expect(result.available).toBe(30)
  })

  it('uses 0 when stock is null', () => {
    const result = transformInventoryLevel(makeVariantStock({ stock: null }))
    expect(result.available).toBe(0)
  })

  it('clamps negative stock to 0', () => {
    const result = transformInventoryLevel(makeVariantStock({ stock: -5 }))
    expect(result.available).toBe(0)
  })

  it('stores productId in metadata', () => {
    const result = transformInventoryLevel(makeVariantStock(), 'prod-10')
    expect((result.metadata as Record<string, unknown>).productId).toBe('prod-10')
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeVariantStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
