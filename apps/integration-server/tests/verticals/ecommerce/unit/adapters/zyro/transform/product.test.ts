import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  type RawZyroProduct,
  type RawZyroVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/zyro/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawZyroProduct> = {}): RawZyroProduct {
  return {
    id: 'prod-001',
    title: 'Retro Camp Mug',
    description: '<p>A classic enamel mug for your adventures.</p>',
    handle: 'retro-camp-mug',
    status: 'published',
    vendor: 'Camp Co.',
    product_type: 'physical',
    tags: ['outdoor', 'kitchen'],
    currency: 'USD',
    options: [
      { id: 'opt-1', name: 'Color', values: ['Red', 'Blue'], position: 1 },
      { id: 'opt-2', name: 'Size', values: ['Small', 'Large'], position: 2 },
    ],
    variants: [
      {
        id: 'var-001',
        product_id: 'prod-001',
        sku: 'MUG-RED-SM',
        price: 14.99,
        compare_at_price: 19.99,
        stock: 50,
        weight: 250,
        weight_unit: 'g',
        options: { Color: 'Red', Size: 'Small' },
        taxable: true,
        requires_shipping: true,
        position: 1,
      },
    ],
    images: [
      {
        id: 'img-001',
        src: 'https://cdn.zyro.com/store/img/mug-red.jpg',
        alt: 'Red mug front view',
        width: 800,
        height: 800,
        position: 0,
      },
    ],
    created_at: '2024-03-01T08:00:00Z',
    updated_at: '2024-04-01T10:00:00Z',
    published_at: '2024-03-05T12:00:00Z',
    ...overrides,
  }
}

function makeVariant(overrides: Partial<RawZyroVariant> = {}): RawZyroVariant {
  return {
    id: 'var-001',
    product_id: 'prod-001',
    sku: 'MUG-BLUE-LG',
    price: 14.99,
    compare_at_price: 19.99,
    weight: 250,
    weight_unit: 'g',
    options: { Color: 'Blue', Size: 'Large' },
    taxable: true,
    requires_shipping: true,
    position: 2,
    ...overrides,
  }
}

describe('transformProduct', () => {
  it('maps core string fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod-001')
    expect(result.title).toBe('Retro Camp Mug')
    expect(result.description).toBe('<p>A classic enamel mug for your adventures.</p>')
    expect(result.handle).toBe('retro-camp-mug')
    expect(result.vendor).toBe('Camp Co.')
    expect(result.productType).toBe('physical')
  })

  it('maps published status → ACTIVE', () => {
    const result = transformProduct(makeProduct({ status: 'published' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps active status → ACTIVE', () => {
    const result = transformProduct(makeProduct({ status: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft status → DRAFT', () => {
    const result = transformProduct(makeProduct({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps hidden status → ARCHIVED', () => {
    const result = transformProduct(makeProduct({ status: 'hidden' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps archived status → ARCHIVED', () => {
    const result = transformProduct(makeProduct({ status: 'archived' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps tags array', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['outdoor', 'kitchen'])
  })

  it('maps product options with values', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toEqual(['Red', 'Blue'])
    expect(result.options![1]!.name).toBe('Size')
    expect(result.options![1]!.values).toEqual(['Small', 'Large'])
  })

  it('maps variants with price and options', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('var-001')
    expect(v.sku).toBe('MUG-RED-SM')
    expect(v.price).toEqual({ amount: 1499, currency: 'USD' })
    expect(v.compareAtPrice).toEqual({ amount: 1999, currency: 'USD' })
    expect(v.optionValues).toEqual({ Color: 'Red', Size: 'Small' })
    expect(v.productId).toBe('prod-001')
  })

  it('maps images with metadata', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    const img = result.images![0]!
    expect(img.url).toBe('https://cdn.zyro.com/store/img/mug-red.jpg')
    expect(img.alt).toBe('Red mug front view')
    expect(img.width).toBe(800)
    expect(img.height).toBe(800)
  })

  it('maps timestamps', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-03-01T08:00:00Z')
    expect(result.updatedAt).toBe('2024-04-01T10:00:00Z')
    expect(result.publishedAt).toBe('2024-03-05T12:00:00Z')
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

  it('handles minimal product gracefully', () => {
    const result = transformProduct({ id: 'min-1', title: 'Minimal Product' })
    expect(result.id).toBe('min-1')
    expect(result.title).toBe('Minimal Product')
    expect(result.status).toBeUndefined()
    expect(result.variants).toBeUndefined()
    expect(result.images).toBeUndefined()
    expect(result.options).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('falls back to `name` field when `title` is absent', () => {
    const result = transformProduct({ id: 'x', name: 'Name Field Product' })
    expect(result.title).toBe('Name Field Product')
  })
})

describe('transformVariant', () => {
  it('maps variant core fields', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(result.id).toBe('var-001')
    expect(result.sku).toBe('MUG-BLUE-LG')
    expect(result.productId).toBe('prod-001')
    expect(result.price).toEqual({ amount: 1499, currency: 'USD' })
    expect(result.compareAtPrice).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('maps option values', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(result.optionValues).toEqual({ Color: 'Blue', Size: 'Large' })
  })

  it('builds title from option values when title is absent', () => {
    const result = transformVariant(makeVariant({ options: { Color: 'Blue', Size: 'Large' } }))
    expect(result.title).toBe('Blue / Large')
  })

  it('maps weight and weightUnit', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(result.weight).toBe(250)
    expect(result.weightUnit).toBe('g')
  })

  it('handles string price amounts', () => {
    const result = transformVariant(makeVariant({ price: '24.99' }), 'EUR')
    expect(result.price).toEqual({ amount: 2499, currency: 'EUR' })
  })

  it('does not set compareAtPrice when absent or zero', () => {
    const result = transformVariant(makeVariant({ compare_at_price: undefined }), 'USD')
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('maps taxable and requiresShipping flags', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(result.taxable).toBe(true)
    expect(result.requiresShipping).toBe(true)
  })

  it('maps position', () => {
    const result = transformVariant(makeVariant({ position: 3 }), 'USD')
    expect(result.position).toBe(3)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariant()
    const result = transformVariant(raw, 'USD')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('handles minimal variant gracefully', () => {
    const result = transformVariant({ id: 'var-min', price: 9.99 }, 'GBP')
    expect(result.id).toBe('var-min')
    expect(result.price).toEqual({ amount: 999, currency: 'GBP' })
    expect(result.sku).toBeUndefined()
    expect(result.optionValues).toBeUndefined()
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})
