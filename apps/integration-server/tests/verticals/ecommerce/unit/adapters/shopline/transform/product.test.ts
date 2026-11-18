import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawShoplineProduct,
  type RawShoplineVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopline/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawShoplineVariant> = {}): RawShoplineVariant {
  return {
    id: 901,
    product_id: 501,
    title: 'Black / M',
    price: '49.99',
    compare_at_price: '59.99',
    sku: 'SHIRT-BLK-M',
    barcode: '0123456789012',
    position: 1,
    inventory_item_id: 111,
    inventory_quantity: 10,
    weight: 200,
    weight_unit: 'g',
    taxable: true,
    requires_shipping: true,
    option1: 'Black',
    option2: 'M',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawShoplineProduct> = {}): RawShoplineProduct {
  return {
    id: 501,
    title: 'Classic T-Shirt',
    body_html: '<p>Comfortable cotton tee.</p>',
    handle: 'classic-t-shirt',
    status: 'active',
    vendor: 'Acme Co',
    product_type: 'Apparel',
    tags: 'clothing, basics',
    options: [
      { name: 'Color', position: 1, values: ['Black', 'White'] },
      { name: 'Size', position: 2, values: ['S', 'M', 'L'] },
    ],
    variants: [makeVariant()],
    media: [
      {
        id: 201,
        src: 'https://cdn.shopline.com/shirt.jpg',
        alt: 'Black T-Shirt',
        content_type: 'IMAGE',
        width: 800,
        height: 800,
        position: 1,
      },
    ],
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-06-01T08:00:00.000Z',
    published_at: '2024-01-16T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformVariant', () => {
  it('maps core variant fields', () => {
    const raw = makeVariant()
    const result = transformVariant(raw)
    expect(result.id).toBe('901')
    expect(result.productId).toBe('501')
    expect(result.sku).toBe('SHIRT-BLK-M')
    expect(result.barcode).toBe('0123456789012')
    expect(result.title).toBe('Black / M')
  })

  it('converts price to minor units', () => {
    const result = transformVariant(makeVariant(), 'USD')
    // 49.99 → 4999
    expect(result.price).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('converts compare_at_price to minor units', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(result.compareAtPrice).toEqual({ amount: 5999, currency: 'USD' })
  })

  it('omits compareAtPrice when absent', () => {
    const result = transformVariant(makeVariant({ compare_at_price: null }))
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('builds optionValues map from positional option fields', () => {
    const options = [
      { name: 'Color', values: ['Black'] },
      { name: 'Size', values: ['M'] },
    ]
    const result = transformVariant(makeVariant(), 'USD', options)
    expect(result.optionValues).toEqual({ Color: 'Black', Size: 'M' })
  })

  it('maps weight and weight unit', () => {
    const result = transformVariant(makeVariant())
    expect(result.weight).toBe(200)
    expect(result.weightUnit).toBe('g')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariant()
    const result = transformVariant(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies ProductVariantSchema', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct', () => {
  it('maps core product fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('501')
    expect(result.title).toBe('Classic T-Shirt')
    expect(result.description).toBe('<p>Comfortable cotton tee.</p>')
    expect(result.handle).toBe('classic-t-shirt')
    expect(result.status).toBe('ACTIVE')
    expect(result.vendor).toBe('Acme Co')
    expect(result.productType).toBe('Apparel')
  })

  it('splits comma-delimited tag string', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['clothing', 'basics'])
  })

  it('maps media[] to images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.shopline.com/shirt.jpg')
    expect(result.images![0]!.alt).toBe('Black T-Shirt')
  })

  it('falls back to legacy images[] when media is absent', () => {
    const result = transformProduct(
      makeProduct({
        media: undefined,
        images: [{ id: 301, src: 'https://cdn.shopline.com/legacy.jpg', alt: 'Legacy' }],
      }),
    )
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.shopline.com/legacy.jpg')
  })

  it('falls back to featured_media when both media and images absent', () => {
    const result = transformProduct(
      makeProduct({
        media: undefined,
        images: undefined,
        featured_media: { src: 'https://cdn.shopline.com/featured.jpg' },
      }),
    )
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.shopline.com/featured.jpg')
  })

  it('maps options with values', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toEqual(['Black', 'White'])
  })

  it('maps variants with currency', () => {
    const result = transformProduct(makeProduct(), 'USD')
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.price).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('maps timestamps', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-01T08:00:00.000Z')
    expect(result.publishedAt).toBe('2024-01-16T00:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical)
    expect(body.title).toBe('Classic T-Shirt')
    expect(body.vendor).toBe('Acme Co')
    expect(body.status).toBe('active')
  })

  it('round-trips variant via untransformVariant', () => {
    const canonical = transformVariant(makeVariant(), 'USD')
    const body = untransformVariant(canonical)
    expect(body.sku).toBe('SHIRT-BLK-M')
    expect(body.price).toBe('49.99')
    expect(body.compare_at_price).toBe('59.99')
  })
})
