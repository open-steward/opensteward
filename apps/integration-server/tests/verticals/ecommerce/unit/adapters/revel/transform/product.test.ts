import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawRevelProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/revel/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawRevelProduct> = {}): RawRevelProduct {
  return {
    id: 101,
    name: 'Espresso',
    description: 'Double-shot espresso',
    sku: 'ESP-001',
    barcode: '1234567890',
    price: 4.5,
    cost: 1.2,
    active: true,
    attribute: 'Beverages',
    created_date: '2024-01-01T00:00:00Z',
    updated_date: '2024-02-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (Revel)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('101')
    expect(result.title).toBe('Espresso')
    expect(result.description).toBe('Double-shot espresso')
    expect(result.status).toBe('ACTIVE')
    expect(result.productType).toBe('Beverages')
  })

  it('creates a single variant from the product', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('101')
    expect(v.sku).toBe('ESP-001')
    expect(v.barcode).toBe('1234567890')
    expect(v.price).toEqual({ amount: 450, currency: 'USD' })
  })

  it('maps timestamps from ISO strings', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-02-01T00:00:00Z')
  })

  it('marks inactive products as ARCHIVED', () => {
    const result = transformProduct(makeProduct({ active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const minimal: RawRevelProduct = { id: 999 }
    const result = transformProduct(minimal)
    expect(result.id).toBe('999')
    expect(result.title).toBe('')
    expect(result.status).toBe('ACTIVE')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('includes image when present', () => {
    const result = transformProduct(makeProduct({ image: 'https://cdn.revel.com/img.jpg' }))
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.revel.com/img.jpg')
  })

  it('omits images when no image field', () => {
    const result = transformProduct(makeProduct({ image: undefined }))
    expect(result.images).toBeUndefined()
  })
})

describe('untransformProduct (Revel)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformProduct(makeProduct())
    const raw = untransformProduct(canonical)
    expect(raw['name']).toBe('Espresso')
    expect(raw['description']).toBe('Double-shot espresso')
  })

  it('maps price directly (no cents conversion)', () => {
    const raw = untransformProduct({
      title: 'Test',
      variants: [{ id: '1', price: { amount: 450, currency: 'USD' }, metadata: {} }],
    })
    expect(raw['price']).toBe(4.5)
  })

  it('sets active=false for ARCHIVED status', () => {
    const raw = untransformProduct({ status: 'ARCHIVED' })
    expect(raw['active']).toBe(false)
  })

  it('sets active=true for ACTIVE status', () => {
    const raw = untransformProduct({ status: 'ACTIVE' })
    expect(raw['active']).toBe(true)
  })
})
