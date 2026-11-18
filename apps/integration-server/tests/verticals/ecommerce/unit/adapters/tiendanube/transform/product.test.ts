import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawTiendanubeProduct,
  type RawTiendanubeVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiendanube/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawTiendanubeVariant> = {}): RawTiendanubeVariant {
  return {
    id: 500,
    product_id: 100,
    price: '29.99',
    sku: 'TSHIRT-SM',
    barcode: '0123456789012',
    weight: '0.3',
    values: [{ en: 'Small' }],
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawTiendanubeProduct> = {}): RawTiendanubeProduct {
  return {
    id: 100,
    name: { en: 'Wireless Keyboard', es: 'Teclado Inalámbrico' },
    description: { en: '<p>A great keyboard.</p>' },
    handle: { en: 'wireless-keyboard' },
    brand: 'Acme',
    published: true,
    tags: 'accessories, keyboards',
    attributes: [{ en: 'Size' }],
    variants: [makeVariant()],
    images: [
      {
        id: 1,
        src: 'https://example.com/img.jpg',
        alt: ['Keyboard front'],
        position: 0,
      },
    ],
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('transformVariant (Tiendanube)', () => {
  it('maps id, productId, sku and barcode', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(result.id).toBe('500')
    expect(result.productId).toBe('100')
    expect(result.sku).toBe('TSHIRT-SM')
    expect(result.barcode).toBe('0123456789012')
  })

  it('converts price from major-unit string to minor units', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(result.price).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('maps weight and sets weightUnit to kg', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(result.weight).toBeCloseTo(0.3)
    expect(result.weightUnit).toBe('kg')
  })

  it('builds optionValues from values array and attributes', () => {
    const result = transformVariant(makeVariant(), 'USD', [{ en: 'Size' }])
    expect(result.optionValues).toEqual({ Size: 'Small' })
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariant()
    const result = transformVariant(raw, 'USD')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    const result = transformVariant(makeVariant(), 'USD', [{ en: 'Size' }])
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('round-trips price via untransformVariant', () => {
    const variant = transformVariant(makeVariant(), 'USD')
    const body = untransformVariant(variant)
    // price in untransform is major units string
    expect(body['price']).toBe('29.99')
    expect(body['sku']).toBe('TSHIRT-SM')
  })
})

describe('transformProduct (Tiendanube)', () => {
  it('maps id, title from i18n object (prefers en)', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('100')
    expect(result.title).toBe('Wireless Keyboard')
  })

  it('maps handle from i18n object and vendor from brand', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('wireless-keyboard')
    expect(result.vendor).toBe('Acme')
  })

  it('maps published=true to ACTIVE status', () => {
    expect(transformProduct(makeProduct({ published: true })).status).toBe('ACTIVE')
    expect(transformProduct(makeProduct({ published: false })).status).toBe('DRAFT')
  })

  it('splits comma-separated tags', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['accessories', 'keyboards'])
  })

  it('maps variants and images', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://example.com/img.jpg')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips title and status via untransformProduct', () => {
    const product = transformProduct(makeProduct())
    const body = untransformProduct(product)
    expect(body['name']).toEqual({ en: 'Wireless Keyboard' })
    expect(body['published']).toBe(true)
  })
})
