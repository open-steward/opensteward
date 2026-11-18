import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  transformVariant,
  type RawWixProduct,
  type RawWixVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/wix/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawWixProduct> = {}): RawWixProduct {
  return {
    id: 'prod-001',
    name: 'Ocean Blue T-Shirt',
    description: '<p>A comfy tee.</p>',
    slug: 'ocean-blue-t-shirt',
    visible: true,
    productType: 'physical',
    brand: 'Acme',
    priceData: { price: 19.99, currency: 'USD' },
    productOptions: [
      { name: 'Size', optionType: 'drop_down', choices: [{ value: 'S' }, { value: 'M' }, { value: 'L' }] },
      { name: 'Color', optionType: 'color', choices: [{ value: 'Blue' }] },
    ],
    variants: [
      {
        id: 'var-001',
        choices: { Size: 'S', Color: 'Blue' },
        variant: {
          priceData: { price: 19.99, currency: 'USD' },
          sku: 'TEE-S-BLUE',
          weight: 180,
        },
      },
    ],
    media: {
      items: [
        {
          id: 'img-001',
          fullUrl: 'https://static.wixstatic.com/img/001.jpg',
          altText: 'Front',
          width: 1200,
          height: 1200,
        },
      ],
    },
    createdDate: '2024-01-10T12:00:00Z',
    lastUpdated: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

function makeVariant(overrides: Partial<RawWixVariant> = {}): RawWixVariant {
  return {
    id: 'var-001',
    choices: { Size: 'S', Color: 'Blue' },
    variant: {
      priceData: { price: 19.99, currency: 'USD' },
      sku: 'TEE-S-BLUE',
      weight: 180,
    },
    ...overrides,
  }
}

describe('transformProduct', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod-001')
    expect(result.title).toBe('Ocean Blue T-Shirt')
    expect(result.handle).toBe('ocean-blue-t-shirt')
    expect(result.description).toBe('<p>A comfy tee.</p>')
    expect(result.vendor).toBe('Acme')
    expect(result.productType).toBe('physical')
  })

  it('maps VISIBLE → ACTIVE status', () => {
    const result = transformProduct(makeProduct({ visible: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps HIDDEN → ARCHIVED status', () => {
    const result = transformProduct(makeProduct({ visible: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps variants with option values', () => {
    const result = transformProduct(makeProduct())
    const variant = result.variants![0]!
    expect(variant.id).toBe('var-001')
    expect(variant.sku).toBe('TEE-S-BLUE')
    expect(variant.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(variant.optionValues).toEqual({ Size: 'S', Color: 'Blue' })
    expect(variant.productId).toBe('prod-001')
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://static.wixstatic.com/img/001.jpg')
    expect(result.images![0]!.alt).toBe('Front')
  })

  it('maps product options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]!.name).toBe('Size')
    expect(result.options![0]!.values).toEqual(['S', 'M', 'L'])
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
    expect(raw.name).toBe('Ocean Blue T-Shirt')
    expect(raw.description).toBe('<p>A comfy tee.</p>')
    expect(raw.slug).toBe('ocean-blue-t-shirt')
    expect(raw.visible).toBe(true)
    expect(raw.brand).toBe('Acme')
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformProduct({ id: 'min', name: 'Minimal' })
    expect(result.id).toBe('min')
    expect(result.title).toBe('Minimal')
    expect(result.variants).toBeUndefined()
    expect(result.images).toBeUndefined()
    expect(result.options).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformVariant', () => {
  it('maps variant fields', () => {
    const result = transformVariant(makeVariant(), 'USD', 'prod-001')
    expect(result.id).toBe('var-001')
    expect(result.sku).toBe('TEE-S-BLUE')
    expect(result.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(result.weight).toBe(180)
    expect(result.productId).toBe('prod-001')
  })

  it('builds title from choices', () => {
    const result = transformVariant(makeVariant())
    expect(result.title).toBe('S / Blue')
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const result = transformVariant(makeVariant())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('handles string price amounts', () => {
    const v = makeVariant()
    v.variant!.priceData!.price = '29.99'
    const result = transformVariant(v)
    expect(result.price.amount).toBe(2999)
  })
})
