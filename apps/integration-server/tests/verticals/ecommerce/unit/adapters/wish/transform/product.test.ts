import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  transformV3Product,
  transformV3Variation,
  type RawWishProduct,
  type RawWishVariant,
  type RawWishV3Product,
  type RawWishV3Variation,
} from '../../../../../../../src/verticals/ecommerce/adapters/wish/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawWishProduct> = {}): RawWishProduct {
  return {
    id: 'prod-001',
    name: 'Blue Widget',
    description: 'A great blue widget.',
    sku: 'blue-widget',
    tags: 'electronics, gadgets',
    main_image: 'https://cdn.example.com/img/blue-widget.jpg',
    extra_images: ['https://cdn.example.com/img/blue-widget-2.jpg'],
    enabled: true,
    create_time: '2024-06-01T00:00:00Z',
    last_updated: '2024-06-15T10:00:00Z',
    ...overrides,
  }
}

function makeVariant(overrides: Partial<RawWishVariant> = {}): RawWishVariant {
  return {
    id: 'var-001',
    product_id: 'prod-001',
    sku: 'BW-BLUE-M',
    price: 19.99,
    shipping: 5.0,
    inventory: 50,
    color: 'Blue',
    size: 'M',
    enabled: true,
    create_time: '2024-06-01T00:00:00Z',
    last_updated: '2024-06-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (Wish)', () => {
  it('maps id to string product id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod-001')
  })

  it('maps name to title', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('Blue Widget')
  })

  it('maps description', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('A great blue widget.')
  })

  it('maps sku to handle', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('blue-widget')
  })

  it('maps enabled=true to ACTIVE status', () => {
    const result = transformProduct(makeProduct({ enabled: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps enabled=false to DRAFT status', () => {
    const result = transformProduct(makeProduct({ enabled: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps undefined enabled to undefined status', () => {
    const result = transformProduct(makeProduct({ enabled: undefined }))
    expect(result.status).toBeUndefined()
  })

  it('splits comma-separated tags string', () => {
    const result = transformProduct(makeProduct({ tags: 'electronics, gadgets, blue' }))
    expect(result.tags).toEqual(['electronics', 'gadgets', 'blue'])
  })

  it('maps main_image as first image', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toBeDefined()
    expect(result.images![0]!.url).toBe('https://cdn.example.com/img/blue-widget.jpg')
  })

  it('appends extra_images after main_image', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![1]!.url).toBe('https://cdn.example.com/img/blue-widget-2.jpg')
  })

  it('maps create_time to createdAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('maps last_updated to updatedAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.updatedAt).toBe('2024-06-15T10:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined images when no images are provided', () => {
    const result = transformProduct(makeProduct({ main_image: undefined, extra_images: undefined }))
    expect(result.images).toBeUndefined()
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformVariant (Wish)', () => {
  it('maps id field to string variant id', () => {
    const result = transformVariant(makeVariant())
    expect(result.id).toBe('var-001')
  })

  it('maps product_id to productId', () => {
    const result = transformVariant(makeVariant())
    expect(result.productId).toBe('prod-001')
  })

  it('maps sku', () => {
    const result = transformVariant(makeVariant())
    expect(result.sku).toBe('BW-BLUE-M')
  })

  it('converts price from major USD to minor units', () => {
    const result = transformVariant(makeVariant({ price: 19.99 }))
    expect(result.price.amount).toBe(1999)
    expect(result.price.currency).toBe('USD')
  })

  it('builds title from color and size', () => {
    const result = transformVariant(makeVariant({ color: 'Blue', size: 'M' }))
    expect(result.title).toBe('Blue / M')
  })

  it('builds optionValues record from color and size', () => {
    const result = transformVariant(makeVariant())
    expect(result.optionValues).toEqual({ Color: 'Blue', Size: 'M' })
  })

  it('omits optionValues when no color or size', () => {
    const result = transformVariant(makeVariant({ color: undefined, size: undefined }))
    expect(result.optionValues).toBeUndefined()
  })

  it('falls back to sku as id when id is missing', () => {
    const result = transformVariant(makeVariant({ id: undefined, sku: 'MY-SKU' }))
    expect(result.id).toBe('MY-SKU')
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    const result = transformVariant(makeVariant())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (Wish)', () => {
  it('maps title to name', () => {
    const body = untransformProduct({ title: 'New Widget' })
    expect(body['name']).toBe('New Widget')
  })

  it('maps status=ACTIVE to enabled=true', () => {
    const body = untransformProduct({ status: 'ACTIVE' })
    expect(body['enabled']).toBe(true)
  })

  it('maps status=DRAFT to enabled=false', () => {
    const body = untransformProduct({ status: 'DRAFT' })
    expect(body['enabled']).toBe(false)
  })

  it('joins tags array with comma separator', () => {
    const body = untransformProduct({ tags: ['a', 'b', 'c'] })
    expect(body['tags']).toBe('a, b, c')
  })

  it('maps first image to main_image url', () => {
    const body = untransformProduct({
      images: [{ url: 'https://example.com/img.jpg' }],
    })
    expect(body['main_image']).toBe('https://example.com/img.jpg')
  })
})

describe('untransformVariant (Wish)', () => {
  it('maps sku', () => {
    const body = untransformVariant({ sku: 'MY-SKU' })
    expect(body['sku']).toBe('MY-SKU')
  })

  it('converts minor unit price back to decimal major string', () => {
    const body = untransformVariant({ price: { amount: 1999, currency: 'USD' } })
    expect(body['price']).toBe('19.99')
  })

  it('maps optionValues Color to color field', () => {
    const body = untransformVariant({ optionValues: { Color: 'Red', Size: 'L' } })
    expect(body['color']).toBe('Red')
    expect(body['size']).toBe('L')
  })
})

// ── API v3 ───────────────────────────────────────────────────────────────────
//
// Fixtures use only fields of the v3 `ShallowProduct`, `Product` and
// `ProductVariation` schemas in the first-party OpenAPI behind
// https://merchant.wish.com/documentation/api/v3/reference.

function makeV3Variation(overrides: Partial<RawWishV3Variation> = {}): RawWishV3Variation {
  return {
    id: '5d30f60e0a6fc464f4f376d3',
    product_id: '5d30f60e0a6fc464f4f376b0',
    sku: 'BW-BLUE-M',
    gtin: '0123456789012',
    status: 'ENABLED',
    price: { amount: 10.4, currency_code: 'USD' },
    options: [
      { name: 'COLOR', value: 'Blue' },
      { name: 'SIZE', value: 'M' },
    ],
    inventories: [{ warehouse_id: '5d30f60e0a6fc464f4f37600', inventory: 7 }],
    logistics_details: { weight: 120, length: 10, width: 5, height: 2 },
    ...overrides,
  }
}

function makeV3Product(overrides: Partial<RawWishV3Product> = {}): RawWishV3Product {
  return {
    id: '5d30f60e0a6fc464f4f376b0',
    name: 'Blue Widget',
    description: 'A great blue widget.',
    parent_sku: 'BW',
    tags: ['electronics', 'gadgets'],
    state: 'ACTIVE',
    status: 'APPROVED',
    created_at: '2020-01-01T07:00:00.000Z',
    updated_at: '2020-02-01T07:00:00.000Z',
    ...overrides,
  }
}

describe('transformV3Product (Wish v3 ShallowProduct / Product)', () => {
  it('maps a ShallowProduct list row and satisfies ProductSchema', () => {
    const result = ProductSchema.parse(transformV3Product(makeV3Product()))
    expect(result.id).toBe('5d30f60e0a6fc464f4f376b0')
    expect(result.title).toBe('Blue Widget')
    expect(result.description).toBe('A great blue widget.')
    expect(result.tags).toEqual(['electronics', 'gadgets'])
    expect(result.status).toBe('ACTIVE')
    expect(result.createdAt).toBe('2020-01-01T07:00:00.000Z')
    expect(result.updatedAt).toBe('2020-02-01T07:00:00.000Z')
    expect(result.images).toBeUndefined()
    expect(result.variants).toBeUndefined()
    expect(result.handle).toBeUndefined()
  })

  it.each([
    ['ACTIVE', 'ACTIVE'],
    ['WISH_INACTIVE', 'DRAFT'],
    ['MERCHANT_INACTIVE', 'DRAFT'],
    ['REMOVED_BY_WISH', 'ARCHIVED'],
    ['REMOVED_BY_MERCHANT', 'ARCHIVED'],
    [undefined, undefined],
  ] as const)('maps state %s to status %s', (state, status) => {
    const result = ProductSchema.parse(transformV3Product(makeV3Product({ state })))
    expect(result.status).toBe(status)
  })

  it('maps the detail: main image first, extra images, and variations', () => {
    const result = ProductSchema.parse(
      transformV3Product(
        makeV3Product({
          main_image: { url: 'https://cdn.example.com/main.jpg' },
          extra_images: [{ url: 'https://cdn.example.com/extra.jpg' }],
          variations: [makeV3Variation()],
        }),
      ),
    )
    expect(result.images).toEqual([
      { url: 'https://cdn.example.com/main.jpg' },
      { url: 'https://cdn.example.com/extra.jpg' },
    ])
    expect(result.variants?.map((v) => v.id)).toEqual(['5d30f60e0a6fc464f4f376d3'])
  })

  it('leaves a variation without a price out of variants instead of failing the product', () => {
    const priceless = makeV3Variation({ id: '5d30f60e0a6fc464f4f376d4', price: undefined })
    const raw = makeV3Product({ variations: [makeV3Variation(), priceless] })
    const result = ProductSchema.parse(transformV3Product(raw))
    expect(result.variants?.map((v) => v.id)).toEqual(['5d30f60e0a6fc464f4f376d3'])
    expect(result.metadata?.['variations']).toEqual([makeV3Variation(), priceless])
  })

  it('throws without an id or a name rather than inventing one', () => {
    expect(() => transformV3Product(makeV3Product({ id: undefined }))).toThrow(/no id/)
    expect(() => transformV3Product(makeV3Product({ name: undefined }))).toThrow(/no name/)
  })
})

describe('transformV3Variation (Wish v3 ProductVariation)', () => {
  it('maps a variation and satisfies ProductVariantSchema', () => {
    const result = ProductVariantSchema.parse(transformV3Variation(makeV3Variation()))
    expect(result.id).toBe('5d30f60e0a6fc464f4f376d3')
    expect(result.productId).toBe('5d30f60e0a6fc464f4f376b0')
    expect(result.sku).toBe('BW-BLUE-M')
    expect(result.barcode).toBe('0123456789012')
    expect(result.price).toEqual({ amount: 1040, currency: 'USD' })
    expect(result.optionValues).toEqual({ COLOR: 'Blue', SIZE: 'M' })
    expect(result.weight).toBe(120)
    expect(result.weightUnit).toBe('g')
  })

  it('keeps the documented currency of the price', () => {
    const result = ProductVariantSchema.parse(
      transformV3Variation(makeV3Variation({ price: { amount: 1500, currency_code: 'JPY' } })),
    )
    expect(result.price).toEqual({ amount: 1500, currency: 'JPY' })
  })

  it('omits weight and options when absent', () => {
    const result = ProductVariantSchema.parse(
      transformV3Variation(makeV3Variation({ logistics_details: undefined, options: undefined })),
    )
    expect(result.weight).toBeUndefined()
    expect(result.weightUnit).toBeUndefined()
    expect(result.optionValues).toBeUndefined()
  })

  it('throws without an id or a price rather than inventing one', () => {
    expect(() => transformV3Variation(makeV3Variation({ id: undefined }))).toThrow(/no id/)
    expect(() => transformV3Variation(makeV3Variation({ price: undefined }))).toThrow(/no price/)
  })
})
