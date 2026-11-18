import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawSnipcartProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/snipcart/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawSnipcartProduct> = {}): RawSnipcartProduct {
  return {
    id: 'prod-guid-abc',
    name: 'Wireless Keyboard',
    description: 'A compact wireless keyboard.',
    // Snipcart uses the product URL as handle — must be slug-compatible or undefined
    url: undefined,
    mode: 'Live',
    archived: false,
    price: 49.99,
    stock: 10,
    totalStock: 10,
    inventoryManagementMethod: 'Product',
    creationDate: '2024-01-15T09:00:00.000Z',
    modificationDate: '2024-06-01T12:00:00.000Z',
    image: 'https://cdn.example.com/keyboard.jpg',
    ...overrides,
  }
}

describe('transformProduct (Snipcart)', () => {
  it('maps id and name to id and title', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod-guid-abc')
    expect(result.title).toBe('Wireless Keyboard')
  })

  it('maps description', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('A compact wireless keyboard.')
  })

  it('maps image URL to images array', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/keyboard.jpg')
  })

  it('maps archived=false → ACTIVE status', () => {
    const result = transformProduct(makeProduct())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps archived=true → ARCHIVED status', () => {
    const result = transformProduct(makeProduct({ archived: true }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps mode=Test → DRAFT status', () => {
    const result = transformProduct(makeProduct({ mode: 'Test', archived: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps creationDate and modificationDate to createdAt/updatedAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-15T09:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-01T12:00:00.000Z')
  })

  it('leaves handle undefined when url is undefined', () => {
    const result = transformProduct(makeProduct({ url: undefined }))
    expect(result.handle).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    expect(transformProduct(raw).metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() => ProductSchema.parse(transformProduct(makeProduct()))).not.toThrow()
  })

  it('produces a schema-valid result with no image', () => {
    expect(() =>
      ProductSchema.parse(transformProduct(makeProduct({ image: null }))),
    ).not.toThrow()
  })
})
