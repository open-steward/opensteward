import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawSaleorProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/saleor/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawSaleorProduct> = {}): RawSaleorProduct {
  return {
    id: 'UHJvZHVjdDox',
    name: 'Ocean Blue T-Shirt',
    description: '<p>A comfy tee.</p>',
    slug: 'ocean-blue-t-shirt',
    productType: { id: 'PT1', name: 'Shirts' },
    attributes: [
      {
        attribute: { id: 'A1', name: 'Size', slug: 'size' },
        values: [
          { id: 'V1', name: 'S', slug: 's' },
          { id: 'V2', name: 'M', slug: 'm' },
        ],
      },
    ],
    variants: [
      {
        id: 'UHJvZHVjdFZhcmlhbnQ6MQ==',
        name: 'S',
        sku: 'TEE-S-BLUE',
        pricing: { price: { gross: { amount: 19.99, currency: 'USD' } } },
        weight: { value: 180, unit: 'g' },
        product: { id: 'UHJvZHVjdDox' },
      },
    ],
    media: [{ id: 'IMG1', url: 'https://saleor.io/img/001.jpg', alt: 'Front' }],
    created: '2024-01-10T12:00:00Z',
    updatedAt: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (Saleor)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('UHJvZHVjdDox')
    expect(result.title).toBe('Ocean Blue T-Shirt')
    expect(result.handle).toBe('ocean-blue-t-shirt')
    expect(result.description).toBe('<p>A comfy tee.</p>')
    expect(result.productType).toBe('Shirts')
    // Product has no publication flag; status is not invented
    expect(result.status).toBeUndefined()
  })

  it('maps variants with the currency Saleor priced them in', () => {
    const result = transformProduct(makeProduct())
    const variant = result.variants![0]!
    expect(variant.id).toBe('UHJvZHVjdFZhcmlhbnQ6MQ==')
    expect(variant.sku).toBe('TEE-S-BLUE')
    expect(variant.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(variant.weightUnit).toBe('g')
    expect(variant.productId).toBe('UHJvZHVjdDox')
  })

  it('leaves out a variant Saleor did not price rather than inventing a price', () => {
    const base = makeProduct()
    const unpriced = { ...base.variants![0]!, id: 'UHJvZHVjdFZhcmlhbnQ6Mg==', pricing: null }
    const result = transformProduct(makeProduct({ variants: [base.variants![0]!, unpriced] }))
    expect(result.variants?.map((v) => v.id)).toEqual(['UHJvZHVjdFZhcmlhbnQ6MQ=='])
    expect(transformProduct(makeProduct({ variants: [unpriced] })).variants).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps media to images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://saleor.io/img/001.jpg')
    expect(result.images![0]!.alt).toBe('Front')
  })

  it('maps attributes to options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Size')
    expect(result.options![0]!.values).toEqual(['S', 'M'])
  })

  it('reads only AttributeValue.name (nullable) for option values, never the slug', () => {
    const result = transformProduct(
      makeProduct({
        attributes: [
          {
            attribute: { id: 'A1', name: 'Size', slug: 'size' },
            values: [
              { id: 'V1', name: null, slug: 's' },
              { id: 'V2', name: 'M', slug: 'm' },
            ],
          },
        ],
      }),
    )
    expect(result.options![0]!.values).toEqual(['M'])
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
    expect(raw['name']).toBe('Ocean Blue T-Shirt')
    expect(raw['slug']).toBe('ocean-blue-t-shirt')
  })
})
