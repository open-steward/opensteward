/**
 * Squarespace v2 product → canonical Product / ProductVariant.
 *
 * Fixtures follow the documented examples at
 * https://developers.squarespace.com/commerce-apis/products: the "List
 * products" 200 example (PaginatedProductListResponseV2 `products[0]`) and
 * the PhysicalProductVariant example body ("pricing": {"basePrice":
 * {"currency": "USD", "value": 49.99}, "onSale": true, "salePrice": ...},
 * "shippingMeasurements": {"weight": {"unit": "KILOGRAM", ...}}). Placeholder
 * strings in the examples ("id", "url", "urlSlug") are replaced with values
 * of the same documented shape so the canonical schema can check them.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawSquarespaceProduct,
  type RawSquarespaceVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/squarespace/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawSquarespaceVariant> = {}): RawSquarespaceVariant {
  return {
    id: 'var-001',
    attributes: { Size: 'S', Color: 'White' },
    gtin: '01234567890128',
    mpn: 'MPN-1234',
    pricing: {
      basePrice: { currency: 'USD', value: 49.99 },
      onSale: false,
      salePrice: { currency: 'USD', value: 39.99 },
    },
    shippingMeasurements: {
      dimensions: { height: 0, length: 0, unit: 'CENTIMETER', width: 0 },
      weight: { unit: 'KILOGRAM', value: 0.4 },
    },
    sku: 'TEE-S-WHITE',
    stock: { quantity: 0, unlimited: true },
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawSquarespaceProduct> = {}): RawSquarespaceProduct {
  return {
    createdOn: '2024-08-25T15:00:00Z',
    description: '<p>Soft organic cotton tee.</p>',
    id: 'prod-abc-123',
    images: [
      {
        altText: 'Front view',
        availableFormats: ['100w', '300w'],
        id: 'img-001',
        orderIndex: 0,
        originalSize: {},
        url: 'https://images.squarespace-cdn.com/img/001.jpg',
      },
    ],
    isVisible: true,
    modifiedOn: '2024-08-25T15:00:00Z',
    name: 'Organic Cotton T-Shirt',
    seoOptions: { description: 'description', title: 'title' },
    storePageId: 'store-page-1',
    tags: ['cotton', 'summer'],
    type: 'PHYSICAL',
    url: '/shop/p/organic-cotton-t-shirt',
    urlSlug: 'organic-cotton-t-shirt',
    variantAttributes: ['Size', 'Color'],
    variants: [makeVariant()],
    ...overrides,
  }
}

describe('transformProduct', () => {
  it('maps the documented fields and parses as ProductSchema', () => {
    const raw = makeProduct()
    const result = ProductSchema.parse(transformProduct(raw))
    expect(result.id).toBe('prod-abc-123')
    expect(result.title).toBe('Organic Cotton T-Shirt')
    expect(result.description).toBe('<p>Soft organic cotton tee.</p>')
    expect(result.handle).toBe('organic-cotton-t-shirt')
    expect(result.status).toBe('ACTIVE')
    expect(result.productType).toBe('PHYSICAL')
    expect(result.tags).toEqual(['cotton', 'summer'])
    expect(result.createdAt).toBe('2024-08-25T15:00:00Z')
    expect(result.updatedAt).toBe('2024-08-25T15:00:00Z')
    expect(result.metadata).toEqual(raw)
  })

  it('maps variants with their parent productId', () => {
    const result = ProductSchema.parse(transformProduct(makeProduct()))
    const variant = result.variants![0]!
    expect(variant.id).toBe('var-001')
    expect(variant.productId).toBe('prod-abc-123')
    expect(variant.price).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('maps images from the documented ProductImage fields', () => {
    const result = ProductSchema.parse(transformProduct(makeProduct()))
    expect(result.images).toEqual([
      {
        id: 'img-001',
        url: 'https://images.squarespace-cdn.com/img/001.jpg',
        alt: 'Front view',
        position: 0,
      },
    ])
  })

  it('drops an image without a url instead of emitting an empty one', () => {
    const result = transformProduct(makeProduct({ images: [{ id: 'img-002', orderIndex: 1 }] }))
    expect(result.images).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('derives 0-indexed options from variant attributes', () => {
    const result = ProductSchema.parse(transformProduct(makeProduct()))
    expect(result.options).toEqual([
      { name: 'Size', values: ['S'], position: 0 },
      { name: 'Color', values: ['White'], position: 1 },
    ])
  })

  it('maps isVisible false to DRAFT status', () => {
    expect(transformProduct(makeProduct({ isVisible: false })).status).toBe('DRAFT')
  })

  it('a DIGITAL product (pricing on the product, no variants) has no variants', () => {
    const result = ProductSchema.parse(
      transformProduct(
        makeProduct({
          type: 'DIGITAL',
          variants: undefined,
          digitalGood: { filename: 'filename', id: 'id' },
          pricing: { basePrice: { currency: 'USD', value: 49.99 }, onSale: false },
        }),
      ),
    )
    expect(result.variants).toBeUndefined()
  })

  it('throws on a product without a name rather than inventing a title', () => {
    expect(() => transformProduct(makeProduct({ name: undefined }))).toThrow(/no name/)
  })

  it('round-trips writable fields via untransformProduct', () => {
    const raw = untransformProduct(transformProduct(makeProduct()))
    expect(raw.name).toBe('Organic Cotton T-Shirt')
    expect(raw.description).toBe('<p>Soft organic cotton tee.</p>')
    expect(raw.urlSlug).toBe('organic-cotton-t-shirt')
    expect(raw.isVisible).toBe(true)
    expect(raw.tags).toEqual(['cotton', 'summer'])
  })
})

describe('transformVariant', () => {
  it('scales the decimal major-unit value to minor units and parses as ProductVariantSchema', () => {
    const result = ProductVariantSchema.parse(transformVariant(makeVariant(), 'prod-abc-123'))
    expect(result.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(result.compareAtPrice).toBeUndefined()
    expect(result.sku).toBe('TEE-S-WHITE')
    expect(result.barcode).toBe('01234567890128')
    expect(result.productId).toBe('prod-abc-123')
  })

  it('scales by the currency exponent (JPY has none)', () => {
    const result = transformVariant(
      makeVariant({ pricing: { basePrice: { currency: 'JPY', value: 4999 }, onSale: false } }),
    )
    expect(result.price).toEqual({ amount: 4999, currency: 'JPY' })
  })

  it('on sale: sells at salePrice with basePrice as the compare-at price', () => {
    const result = ProductVariantSchema.parse(
      transformVariant(
        makeVariant({
          pricing: {
            basePrice: { currency: 'USD', value: 49.99 },
            onSale: true,
            salePrice: { currency: 'USD', value: 39.99 },
          },
        }),
      ),
    )
    expect(result.price).toEqual({ amount: 3999, currency: 'USD' })
    expect(result.compareAtPrice).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('builds title and optionValues from attributes', () => {
    const result = transformVariant(makeVariant())
    expect(result.title).toBe('S / White')
    expect(result.optionValues).toEqual({ Size: 'S', Color: 'White' })
  })

  it('maps the documented weight units KILOGRAM and POUND', () => {
    expect(transformVariant(makeVariant()).weightUnit).toBe('kg')
    expect(transformVariant(makeVariant()).weight).toBe(0.4)
    const lb = transformVariant(
      makeVariant({ shippingMeasurements: { weight: { unit: 'POUND', value: 1.5 } } }),
    )
    expect(lb.weightUnit).toBe('lb')
    expect(lb.weight).toBe(1.5)
  })

  it('omits a weight whose unit is not documented', () => {
    const result = transformVariant(
      makeVariant({ shippingMeasurements: { weight: { unit: 'GRAM', value: 180 } } }),
    )
    expect(result.weight).toBeUndefined()
    expect(result.weightUnit).toBeUndefined()
  })

  it('throws on missing pricing rather than inventing an amount or currency', () => {
    expect(() => transformVariant(makeVariant({ pricing: undefined }))).toThrow(
      /pricing\.basePrice/,
    )
  })

  it('throws on a basePrice without a currency', () => {
    expect(() =>
      transformVariant(makeVariant({ pricing: { basePrice: { value: 49.99 }, onSale: false } })),
    ).toThrow(/pricing\.basePrice/)
  })

  it('reads MonetaryAmount.value only as the documented JSON number, never a string', () => {
    // Spec: MonetaryAmount.value is "Decimal monetary value." with example 49.99.
    expect(() =>
      transformVariant(
        makeVariant({
          pricing: {
            basePrice: { currency: 'USD', value: '49.99' as unknown as number },
            onSale: false,
          },
        }),
      ),
    ).toThrow(/pricing\.basePrice/)
  })

  it('throws when on sale without a salePrice', () => {
    expect(() =>
      transformVariant(
        makeVariant({ pricing: { basePrice: { currency: 'USD', value: 49.99 }, onSale: true } }),
      ),
    ).toThrow(/pricing\.salePrice/)
  })

  it('round-trips writable fields via untransformVariant', () => {
    const raw = untransformVariant(transformVariant(makeVariant()))
    expect(raw.sku).toBe('TEE-S-WHITE')
    expect(raw.attributes).toEqual({ Size: 'S', Color: 'White' })
  })
})
