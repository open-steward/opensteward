import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawWooCommerceProduct,
  type RawWooCommerceVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/ankorstore/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariation(overrides: Partial<RawWooCommerceVariation> = {}): RawWooCommerceVariation {
  return {
    id: 201,
    sku: 'WIDGET-RED',
    price: '19.99',
    regular_price: '24.99',
    sale_price: '19.99',
    status: 'publish',
    weight: '0.5',
    tax_status: 'taxable',
    attributes: [{ name: 'Color', option: 'Red' }],
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawWooCommerceProduct> = {}): RawWooCommerceProduct {
  return {
    id: 100,
    name: 'Blue Widget',
    slug: 'blue-widget',
    status: 'publish',
    description: 'A nice widget.',
    price: '19.99',
    regular_price: '19.99',
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_modified_gmt: '2024-06-01T00:00:00Z',
    tags: [{ name: 'sale' }],
    categories: [{ name: 'Widgets' }],
    images: [
      { id: 300, src: 'https://cdn.example.com/widget.jpg', alt: 'Blue Widget', position: 0 },
    ],
    attributes: [{ name: 'Color', options: ['Blue', 'Red'], variation: true }],
    ...overrides,
  }
}

describe('transformProductVariant (Ankorstore / WooCommerce)', () => {
  it('synthesises id as ${productId}:${variantId}', () => {
    const result = transformProductVariant(makeVariation({ id: 201 }), 'prod-100')
    expect(result.id).toBe('prod-100:201')
  })

  it('maps sku', () => {
    const result = transformProductVariant(makeVariation(), 'p')
    expect(result.sku).toBe('WIDGET-RED')
  })

  it('maps productId', () => {
    const result = transformProductVariant(makeVariation(), 'prod-100')
    expect(result.productId).toBe('prod-100')
  })

  it('converts price to minor units', () => {
    const result = transformProductVariant(makeVariation({ price: '19.99' }), 'p', 'USD')
    expect(result.price.amount).toBe(1999)
    expect(result.price.currency).toBe('USD')
  })

  it('maps compareAtPrice when both sale and regular prices exist', () => {
    const result = transformProductVariant(
      makeVariation({ price: '19.99', regular_price: '24.99', sale_price: '19.99' }),
      'p',
      'USD',
    )
    expect(result.compareAtPrice?.amount).toBe(2499)
  })

  it('maps optionValues from attributes', () => {
    const result = transformProductVariant(makeVariation(), 'p')
    expect(result.optionValues).toEqual({ Color: 'Red' })
  })

  it('maps taxable as true for tax_status=taxable', () => {
    const result = transformProductVariant(makeVariation({ tax_status: 'taxable' }), 'p')
    expect(result.taxable).toBe(true)
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    const result = transformProductVariant(makeVariation(), 'prod-100', 'USD')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct (Ankorstore / WooCommerce)', () => {
  it('maps id to string', () => {
    const result = transformProduct(makeProduct({ id: 999 }))
    expect(result.id).toBe('999')
  })

  it('maps title from name', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('Blue Widget')
  })

  it('maps handle from slug', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('blue-widget')
  })

  it('maps publish status to ACTIVE', () => {
    const result = transformProduct(makeProduct({ status: 'publish' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformProduct(makeProduct({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps private status to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ status: 'private' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps description', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('A nice widget.')
  })

  it('maps productType from first category', () => {
    const result = transformProduct(makeProduct())
    expect(result.productType).toBe('Widgets')
  })

  it('maps tags', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['sale'])
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/widget.jpg')
    expect(result.images![0]!.alt).toBe('Blue Widget')
  })

  it('maps options from attributes with options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toEqual(['Blue', 'Red'])
  })

  it('synthesises a default variant for simple products', () => {
    const result = transformProduct(makeProduct({ type: 'simple', variations: undefined }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('100:default')
  })

  it('maps variation objects when provided', () => {
    const result = transformProduct(
      makeProduct({ type: 'variable', variations: [makeVariation({ id: 201 })] }),
    )
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('100:201')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-06-01T00:00:00Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (Ankorstore / WooCommerce)', () => {
  it('maps title to name', () => {
    const body = untransformProduct({ title: 'New Widget' })
    expect(body.name).toBe('New Widget')
  })

  it('maps ACTIVE status to publish', () => {
    const body = untransformProduct({ status: 'ACTIVE' })
    expect(body.status).toBe('publish')
  })

  it('maps DRAFT status to draft', () => {
    const body = untransformProduct({ status: 'DRAFT' })
    expect(body.status).toBe('draft')
  })

  it('maps ARCHIVED status to private', () => {
    const body = untransformProduct({ status: 'ARCHIVED' })
    expect(body.status).toBe('private')
  })

  it('flattens single variant price to regular_price in major units', () => {
    const body = untransformProduct({
      variants: [{ id: 'v1', price: { amount: 1999, currency: 'USD' }, metadata: {} }],
    })
    expect(body.regular_price).toBe('19.99')
  })
})

describe('untransformProductVariant (Ankorstore / WooCommerce)', () => {
  it('maps sku', () => {
    const body = untransformProductVariant({ sku: 'SKU-123' })
    expect(body.sku).toBe('SKU-123')
  })

  it('converts price minor units to major for regular_price', () => {
    const body = untransformProductVariant({ price: { amount: 2499, currency: 'USD' } })
    expect(body.regular_price).toBe('24.99')
  })
})
