import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  transformVariant,
  type RawScapiProduct,
  type RawScapiVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/salesforce-commerce-cloud/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawScapiProduct> = {}): RawScapiProduct {
  return {
    id: 'product-abc',
    name: 'Running Shoes',
    shortDescription: 'Lightweight running shoes.',
    longDescription: '<p>High-performance running shoes.</p>',
    brand: 'SpeedRun',
    primaryCategoryId: 'footwear',
    currency: 'USD',
    price: 99.99,
    online: true,
    imageGroups: [
      {
        viewType: 'large',
        images: [
          { link: 'https://cdn.sfcc.com/running-shoes.jpg', alt: 'Front view' },
        ],
      },
    ],
    variationAttributes: [
      {
        id: 'size',
        name: 'Size',
        values: [
          { value: 'S', name: 'Small' },
          { value: 'M', name: 'Medium' },
        ],
      },
    ],
    variants: [
      {
        productId: 'product-abc-S',
        variationValues: { size: 'S' },
        price: 99.99,
        orderable: true,
      },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    lastModified: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformProduct', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('product-abc')
    expect(result.title).toBe('Running Shoes')
    expect(result.description).toBe('<p>High-performance running shoes.</p>')
    expect(result.vendor).toBe('SpeedRun')
    expect(result.productType).toBe('footwear')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps online:false to ARCHIVED status', () => {
    const result = transformProduct(makeProduct({ online: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps images from large view group', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.sfcc.com/running-shoes.jpg')
    expect(result.images![0]!.alt).toBe('Front view')
  })

  it('maps variation attributes to options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Size')
    expect(result.options![0]!.values).toEqual(['Small', 'Medium'])
  })

  it('maps variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('product-abc-S')
    expect(result.variants![0]!.price).toEqual({ amount: 9999, currency: 'USD' })
    expect(result.variants![0]!.optionValues).toEqual({ size: 'S' })
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
    expect(raw.name).toBe('Running Shoes')
    expect(raw.longDescription).toBe('<p>High-performance running shoes.</p>')
    expect(raw.online).toBe(true)
    expect(raw.brand).toBe('SpeedRun')
  })
})

describe('transformVariant', () => {
  it('maps variant id, price, and optionValues', () => {
    const parent = makeProduct()
    const rawVariant: RawScapiVariant = {
      productId: 'product-abc-M',
      variationValues: { size: 'M' },
      price: 109.99,
    }
    const result = transformVariant(rawVariant, parent)
    expect(result.id).toBe('product-abc-M')
    expect(result.productId).toBe('product-abc')
    expect(result.price).toEqual({ amount: 10999, currency: 'USD' })
    expect(result.optionValues).toEqual({ size: 'M' })
  })

  it('falls back to parent price when variant price absent', () => {
    const parent = makeProduct({ price: 80.0 })
    const rawVariant: RawScapiVariant = { productId: 'product-abc-L' }
    const result = transformVariant(rawVariant, parent)
    expect(result.price).toEqual({ amount: 8000, currency: 'USD' })
  })
})
