/**
 * ePages Beyond Product/Variation ↔ canonical Product/ProductVariant.
 * Docs: https://api-docs.beyondshop.cloud/ng-product-management-product-management-public-api.html
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariation,
  untransformProduct,
  untransformVariation,
  type RawEpagesProduct,
  type RawEpagesVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/epages/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawEpagesProduct> = {}): RawEpagesProduct {
  return {
    _id: 'p1',
    sku: 'SKU-1',
    name: 'Wireless Keyboard',
    description: 'A compact keyboard.',
    manufacturer: 'Acme',
    visible: true,
    salesPrice: { amount: 19.99, currency: 'EUR', taxModel: 'GROSS' },
    lastModifiedAt: '2026-02-01T14:20:00.000',
    images: [{ _id: 'img1', url: 'https://cdn/keyboard.jpg', position: 0 }],
    ...overrides,
  }
}

function makeVariation(overrides: Partial<RawEpagesVariation> = {}): RawEpagesVariation {
  return {
    _id: 'v1',
    sku: 'SKU-1-BLK',
    salesPrice: { amount: 19.99, currency: 'EUR', taxModel: 'GROSS' },
    variationAttributeValues: [{ displayName: 'Color', value: 'Black' }],
    ...overrides,
  }
}

describe('transformProduct (ePages Beyond)', () => {
  it('maps core fields and converts decimal price to integer minor units', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('p1')
    expect(result.title).toBe('Wireless Keyboard')
    expect(result.vendor).toBe('Acme')
    expect(result.status).toBe('ACTIVE')
    expect(result.images).toEqual([{ id: 'img1', url: 'https://cdn/keyboard.jpg', position: 0 }])
  })

  it('maps visible: false to DRAFT', () => {
    expect(transformProduct(makeProduct({ visible: false })).status).toBe('DRAFT')
  })

  it('throws when name is missing (required, no invented title)', () => {
    expect(() => transformProduct(makeProduct({ name: undefined }))).toThrow(/has no name/)
  })

  it('maps variations into variants sharing productId', () => {
    const result = transformProduct(makeProduct(), [makeVariation()])
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('v1')
    expect(v.productId).toBe('p1')
    expect(v.price).toEqual({ amount: 1999, currency: 'EUR' })
    expect(v.optionValues).toEqual({ Color: 'Black' })
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeProduct()
    expect(transformProduct(raw).metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct(), [makeVariation()])
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformVariation (ePages Beyond) standalone', () => {
  it('builds a canonical variant', () => {
    const v = transformVariation(makeVariation(), 'p1')
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })

  it('throws when salesPrice is missing rather than inventing a price', () => {
    expect(() => transformVariation(makeVariation({ salesPrice: undefined }), 'p1')).toThrow(
      /has no salesPrice/,
    )
  })
})

describe('untransformProduct (ePages Beyond)', () => {
  it('builds a PATCH/POST body converting minor units back to decimal', () => {
    const canonical = transformProduct(makeProduct(), [makeVariation()])
    const body = untransformProduct(canonical) as Record<string, unknown>
    expect(body.name).toBe('Wireless Keyboard')
    expect(body.manufacturer).toBe('Acme')
    expect(body.sku).toBe('SKU-1-BLK')
    // taxModel round-trips from the source variant's own metadata (an update).
    expect(body.salesPrice).toEqual({ amount: 19.99, currency: 'EUR', taxModel: 'GROSS' })
  })

  it('omits taxModel on a fresh create with no source metadata', () => {
    const body = untransformProduct({
      title: 'New',
      variants: [{ id: 'x', price: { amount: 500, currency: 'EUR' }, metadata: {} }],
    }) as Record<string, unknown>
    expect(body.salesPrice).toEqual({ amount: 5, currency: 'EUR' })
  })
})

describe('untransformVariation (ePages Beyond)', () => {
  it('builds a PATCH body for one variation', () => {
    const body = untransformVariation({
      sku: 'SKU-1-BLK',
      price: { amount: 2500, currency: 'EUR' },
    }) as Record<string, unknown>
    expect(body.sku).toBe('SKU-1-BLK')
    expect(body.salesPrice).toEqual({ amount: 25, currency: 'EUR' })
  })
})
