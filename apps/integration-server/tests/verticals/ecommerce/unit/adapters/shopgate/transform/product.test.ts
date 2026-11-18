import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawShopgateProduct,
  type RawShopgateVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopgate/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRawProduct(overrides: Partial<RawShopgateProduct> = {}): RawShopgateProduct {
  return {
    code: 'tshirt-blue',
    name: 'Blue T-Shirt',
    description: '<p>Classic fit</p>',
    status: 'active',
    vendor: 'Fashion Co',
    tags: ['apparel', 'summer'],
    price: {
      price: '25.00',
      salePrice: '19.99',
      currencyCode: 'USD',
    },
    images: [{ url: 'https://cdn.example.com/tshirt.jpg', altText: 'Blue Shirt', position: 1 }],
    variants: [
      {
        code: 'tshirt-blue-s',
        productCode: 'tshirt-blue',
        name: 'Blue T-Shirt S',
        sku: 'BTS-S',
        price: { price: '25.00', salePrice: '19.99', currencyCode: 'USD' },
        attributes: [{ code: 'size', value: 'S' }],
      },
    ],
    createdAt: '2023-12-01T00:00:00.000Z',
    updatedAt: '2024-04-10T12:00:00.000Z',
    ...overrides,
  }
}

function makeRawVariant(overrides: Partial<RawShopgateVariant> = {}): RawShopgateVariant {
  return {
    code: 'tshirt-blue-m',
    productCode: 'tshirt-blue',
    name: 'Blue T-Shirt M',
    sku: 'BTS-M',
    gtin: '012345678905',
    price: { price: '25.00', salePrice: '19.99', currencyCode: 'USD' },
    attributes: [{ code: 'size', value: 'M' }],
    weight: 0.3,
    weightUnit: 'kg',
    ...overrides,
  }
}

describe('shopgate transformProduct', () => {
  it('uses code as id', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.id).toBe('tshirt-blue')
  })

  it('maps name to title', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.title).toBe('Blue T-Shirt')
  })

  it('maps ACTIVE status from status=active', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps ARCHIVED status from status=inactive', () => {
    const result = transformProduct(makeRawProduct({ status: 'inactive' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('uses salePrice as selling price and price as compareAtPrice', () => {
    const result = transformProduct(makeRawProduct())
    // salePrice 19.99 USD = 1999 cents
    expect(result.variants![0].price.amount).toBe(1999)
    // original price 25.00 USD = 2500 cents
    expect(result.variants![0].compareAtPrice?.amount).toBe(2500)
  })

  it('maps tags array', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.tags).toEqual(['apparel', 'summer'])
  })

  it('maps attributes to optionValues record', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.variants![0].optionValues).toEqual({ size: 'S' })
  })

  it('produces output that passes ProductSchema', () => {
    const result = transformProduct(makeRawProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformProduct', () => {
    const canonical = transformProduct(makeRawProduct())
    const back = untransformProduct(canonical)
    expect(back.code).toBe('tshirt-blue')
    expect(back.name).toBe('Blue T-Shirt')
  })
})

describe('shopgate transformVariant', () => {
  it('uses code as id and productCode as productId', () => {
    const result = transformVariant(makeRawVariant())
    expect(result.id).toBe('tshirt-blue-m')
    expect(result.productId).toBe('tshirt-blue')
  })

  it('uses salePrice as price amount in minor units', () => {
    // 19.99 USD = 1999 cents
    const result = transformVariant(makeRawVariant())
    expect(result.price.amount).toBe(1999)
    expect(result.price.currency).toBe('USD')
  })

  it('uses original price as compareAtPrice when salePrice is present', () => {
    // 25.00 USD = 2500 cents
    const result = transformVariant(makeRawVariant())
    expect(result.compareAtPrice?.amount).toBe(2500)
  })

  it('maps gtin as barcode', () => {
    const result = transformVariant(makeRawVariant())
    expect(result.barcode).toBe('012345678905')
  })

  it('maps attributes to optionValues record', () => {
    const result = transformVariant(makeRawVariant())
    expect(result.optionValues).toEqual({ size: 'M' })
  })

  it('produces output that passes ProductVariantSchema', () => {
    const result = transformVariant(makeRawVariant())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformVariant', () => {
    const canonical = transformVariant(makeRawVariant())
    const back = untransformVariant(canonical)
    expect(back.code).toBe('tshirt-blue-m')
    expect(back.sku).toBe('BTS-M')
  })
})
