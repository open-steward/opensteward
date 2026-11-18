import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type XCartProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/xcart/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeProduct(overrides: Partial<XCartProduct> = {}): XCartProduct {
  return {
    id: 123,
    sku: 'PROD-001',
    name: 'Wireless Keyboard',
    description: '<p>A compact wireless keyboard.</p>',
    brief_description: 'Compact wireless keyboard',
    price: 49.99,
    sale_price: null,
    enabled: true,
    weight: 0.5,
    quantity: 100,
    images: [],
    categories: [{ id: 5, name: 'Electronics' }],
    tags: [],
    vendor: 'TechBrand',
    ...overrides,
  }
}

describe('transformInventoryLevel (X-Cart)', () => {
  it('synthesises id from productId with default location', () => {
    const result = transformInventoryLevel(makeProduct())
    expect(result.id).toBe('123:default:default')
  })

  it('sets variantId to productId:default', () => {
    const result = transformInventoryLevel(makeProduct())
    expect(result.variantId).toBe('123:default')
  })

  it('sets locationId to default', () => {
    const result = transformInventoryLevel(makeProduct())
    expect(result.locationId).toBe('default')
  })

  it('maps available from quantity field', () => {
    const result = transformInventoryLevel(makeProduct({ quantity: 42 }))
    expect(result.available).toBe(42)
  })

  it('defaults available to 0 when quantity is null', () => {
    const result = transformInventoryLevel(makeProduct({ quantity: null }))
    expect(result.available).toBe(0)
  })

  it('defaults available to 0 when quantity is undefined', () => {
    const raw = makeProduct()
    delete raw['quantity']
    const result = transformInventoryLevel(raw)
    expect(result.available).toBe(0)
  })

  it('handles zero quantity', () => {
    const result = transformInventoryLevel(makeProduct({ quantity: 0 }))
    expect(result.available).toBe(0)
  })

  it('handles large quantity values', () => {
    const result = transformInventoryLevel(makeProduct({ quantity: 99999 }))
    expect(result.available).toBe(99999)
  })

  it('stringifies numeric product id', () => {
    const result = transformInventoryLevel(makeProduct({ id: 9876 }))
    expect(result.id).toContain('9876')
    expect(result.variantId).toBe('9876:default')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeProduct())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('works correctly for a product with string id', () => {
    const result = transformInventoryLevel(makeProduct({ id: '555' }))
    expect(result.id).toBe('555:default:default')
    expect(result.variantId).toBe('555:default')
  })

  it('maps product with high stock correctly', () => {
    const result = transformInventoryLevel(makeProduct({ quantity: 1000 }))
    expect(result.available).toBe(1000)
    expect(result.locationId).toBe('default')
  })
})
