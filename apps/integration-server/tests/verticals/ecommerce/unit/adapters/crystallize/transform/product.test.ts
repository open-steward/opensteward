import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawCrystallizeProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/crystallize/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawCrystallizeProduct> = {}): RawCrystallizeProduct {
  return {
    id: 'prod-001',
    name: 'Ceramic Coffee Mug',
    cataloguePath: 'shop-mugs-ceramic-coffee-mug',
    shape: { identifier: 'product', name: 'Product' },
    isPublished: true,
    components: [
      {
        name: 'Description',
        type: 'richText',
        content: { html: ['<p>A beautifully crafted ceramic mug.</p>'], plainText: 'A beautifully crafted ceramic mug.' },
      },
    ],
    variants: [
      {
        id: 'var-001',
        name: 'White',
        sku: 'MUG-WHT',
        isDefault: true,
        priceVariants: [
          { identifier: 'default', name: 'Default', price: 24.99, currency: 'USD' },
          { identifier: 'eu', name: 'EU', price: 22.99, currency: 'EUR' },
        ],
        attributes: [
          { attribute: 'Color', value: 'White' },
        ],
        images: [
          { url: 'https://media.crystallize.com/mug-white.jpg', altText: 'White Mug', key: 'img-001' },
        ],
        stock: [{ location: 'warehouse-1', stock: 50 }],
      },
      {
        id: 'var-002',
        name: 'Black',
        sku: 'MUG-BLK',
        isDefault: false,
        priceVariants: [
          { identifier: 'default', name: 'Default', price: 24.99, currency: 'USD' },
        ],
        attributes: [
          { attribute: 'Color', value: 'Black' },
        ],
        images: [
          { url: 'https://media.crystallize.com/mug-black.jpg', altText: 'Black Mug', key: 'img-002' },
        ],
        stock: [],
      },
    ],
    topics: [{ id: 'topic-1', name: 'Kitchenware' }],
    createdAt: '2024-03-15T10:00:00.000Z',
    updatedAt: '2024-04-01T14:30:00.000Z',
    ...overrides,
  }
}

describe('transformProduct (Crystallize)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod-001')
    expect(result.title).toBe('Ceramic Coffee Mug')
    expect(result.handle).toBe('shop-mugs-ceramic-coffee-mug')
    expect(result.productType).toBe('Product')
    expect(result.status).toBe('ACTIVE')
  })

  it('extracts description from components', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('<p>A beautifully crafted ceramic mug.</p>')
  })

  it('falls back to plainText description', () => {
    const result = transformProduct(makeProduct({
      components: [
        { name: 'Description', type: 'richText', content: { plainText: 'Plain desc' } },
      ],
    }))
    expect(result.description).toBe('Plain desc')
  })

  it('maps variants with currency-aware pricing', () => {
    const result = transformProduct(makeProduct(), 'EUR')
    const variant = result.variants![0]!
    expect(variant.id).toBe('var-001')
    expect(variant.sku).toBe('MUG-WHT')
    expect(variant.price).toEqual({ amount: 2299, currency: 'EUR' })
  })

  it('uses default price variant when currency not found', () => {
    const result = transformProduct(makeProduct(), 'GBP')
    const variant = result.variants![0]!
    expect(variant.price).toEqual({ amount: 2499, currency: 'USD' })
  })

  it('maps images from variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]!.url).toBe('https://media.crystallize.com/mug-white.jpg')
    expect(result.images![0]!.alt).toBe('White Mug')
  })

  it('deduplicates images across variants', () => {
    const product = makeProduct()
    product.variants![1]!.images = product.variants![0]!.images
    const result = transformProduct(product)
    expect(result.images).toHaveLength(1)
  })

  it('maps variant attributes to options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toEqual(['White', 'Black'])
  })

  it('maps topics to tags', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['Kitchenware'])
  })

  it('maps draft status', () => {
    const result = transformProduct(makeProduct({ isPublished: false }))
    expect(result.status).toBe('DRAFT')
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

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const raw = untransformProduct(canonical)
    expect(raw['name']).toBe('Ceramic Coffee Mug')
    expect(raw['cataloguePath']).toBe('shop-mugs-ceramic-coffee-mug')
    expect(raw['isPublished']).toBe(true)
  })

  it('handles missing components gracefully', () => {
    const result = transformProduct(makeProduct({ components: undefined }))
    expect(result.description).toBeUndefined()
  })

  it('handles missing variants gracefully', () => {
    const result = transformProduct(makeProduct({ variants: [] }))
    expect(result.variants).toBeUndefined()
    expect(result.images).toBeUndefined()
    expect(result.options).toBeUndefined()
  })
})
