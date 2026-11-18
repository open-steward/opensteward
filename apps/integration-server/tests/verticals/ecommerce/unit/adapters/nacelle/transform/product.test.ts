// Nacelle Product/Variant data model:
//   https://docs.nacelle.com/docs/product-data-model
//   https://docs.nacelle.com/docs/variant-data-model
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  type RawNacelleProduct,
  type RawNacelleVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/nacelle/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRawVariant(overrides: Partial<RawNacelleVariant> = {}): RawNacelleVariant {
  return {
    nacelleEntryId: 'var_abc123',
    productEntryId: 'prod_wk2026',
    sku: 'WK-2026-BLK',
    price: 49.99,
    priceCurrency: 'USD',
    compareAtPrice: 69.99,
    weight: 0.85,
    weightUnit: 'kg',
    quantityAvailable: 12,
    availableForSale: true,
    variantPosition: 0,
    content: [{ title: 'Black', locale: 'en-US' }],
    ...overrides,
  }
}

function makeRawProduct(overrides: Partial<RawNacelleProduct> = {}): RawNacelleProduct {
  return {
    nacelleEntryId: 'prod_wk2026',
    sourceEntryId: '7654321',
    sourceId: 'shopify-src-1',
    availableForSale: true,
    vendor: 'SoundCo',
    productType: 'Electronics',
    tags: ['wireless', 'audio'],
    createdAt: 1709251200, // 2024-03-01T00:00:00Z
    updatedAt: 1710028800, // 2024-03-10T00:00:00Z
    variants: [makeRawVariant()],
    content: [
      {
        title: 'Wireless Headphones',
        description: 'Premium sound quality.',
        handle: 'wireless-headphones',
        locale: 'en-US',
        media: [{ id: 'img_1', url: 'https://cdn.example.com/wh.jpg', position: 0 }],
        options: [{ name: 'Color', values: ['Black', 'White'] }],
        published: true,
      },
    ],
    ...overrides,
  }
}

describe('transformProduct (Nacelle Storefront GraphQL)', () => {
  it('passes the canonical schema', () => {
    const result = transformProduct(makeRawProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps nacelleEntryId to canonical id', () => {
    expect(transformProduct(makeRawProduct()).id).toBe('prod_wk2026')
  })

  it('takes title/description/handle from the content entry', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.title).toBe('Wireless Headphones')
    expect(result.description).toBe('Premium sound quality.')
    expect(result.handle).toBe('wireless-headphones')
  })

  it('converts createdAt/updatedAt from Unix seconds to ISO 8601', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-10T00:00:00.000Z')
  })

  it('maps availableForSale: false to status DRAFT', () => {
    const result = transformProduct(makeRawProduct({ availableForSale: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps availableForSale: true to status ACTIVE', () => {
    const result = transformProduct(makeRawProduct({ availableForSale: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps content.options to canonical ProductOption', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.options).toEqual([{ name: 'Color', values: ['Black', 'White'] }])
  })

  it('maps content.media to canonical images', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.images).toEqual([
      { id: 'img_1', url: 'https://cdn.example.com/wh.jpg', alt: undefined, width: undefined, height: undefined, position: 0 },
    ])
  })

  it('recursively transforms embedded variants', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants?.[0]?.id).toBe('var_abc123')
  })

  it('preserves the raw entry as metadata', () => {
    const raw = makeRawProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toEqual(raw)
  })

  it('throws rather than inventing an empty title when no content entry exists', () => {
    expect(() => transformProduct(makeRawProduct({ content: [] }))).toThrow(/no content title/)
  })
})

describe('transformVariant (Nacelle Storefront GraphQL)', () => {
  it('passes the canonical schema', () => {
    const result = transformVariant(makeRawVariant())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('maps nacelleEntryId to canonical id and productEntryId to productId', () => {
    const result = transformVariant(makeRawVariant())
    expect(result.id).toBe('var_abc123')
    expect(result.productId).toBe('prod_wk2026')
  })

  it('converts decimal price + priceCurrency to canonical integer-minor-unit Money', () => {
    // Documented: variant price is a plain Decimal major-unit number with a
    // separate priceCurrency — NOT NOMS's {amount,currencyCode,precisionDigits}
    // integer shape. 49.99 USD -> 4999 minor units.
    const result = transformVariant(makeRawVariant({ price: 49.99, priceCurrency: 'USD' }))
    expect(result.price).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('converts compareAtPrice the same way', () => {
    const result = transformVariant(makeRawVariant({ compareAtPrice: 69.99, priceCurrency: 'USD' }))
    expect(result.compareAtPrice).toEqual({ amount: 6999, currency: 'USD' })
  })

  it('omits compareAtPrice when not set', () => {
    const result = transformVariant(makeRawVariant({ compareAtPrice: null }))
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('converts a zero-decimal currency correctly (JPY)', () => {
    const result = transformVariant(makeRawVariant({ price: 500, priceCurrency: 'JPY' }))
    expect(result.price).toEqual({ amount: 500, currency: 'JPY' })
  })

  it('throws rather than defaulting to a $0 price when price is missing', () => {
    expect(() => transformVariant(makeRawVariant({ price: undefined }))).toThrow(/price/i)
  })

  it('throws rather than defaulting to USD when priceCurrency is missing', () => {
    expect(() => transformVariant(makeRawVariant({ priceCurrency: undefined }))).toThrow(/priceCurrency/i)
  })

  it('takes title from the variant content entry', () => {
    const result = transformVariant(makeRawVariant())
    expect(result.title).toBe('Black')
  })

  it('passes through a recognised weightUnit', () => {
    const result = transformVariant(makeRawVariant({ weightUnit: 'kg' }))
    expect(result.weightUnit).toBe('kg')
  })

  it('drops an unrecognised weightUnit rather than failing schema validation', () => {
    const result = transformVariant(makeRawVariant({ weightUnit: 'stone' }))
    expect(result.weightUnit).toBeUndefined()
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})
