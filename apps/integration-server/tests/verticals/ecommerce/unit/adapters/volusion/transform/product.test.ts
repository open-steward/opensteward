import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  transformVariant,
  type RawVolusionProduct,
  type RawVolusionVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/volusion/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawVolusionProduct> = {}): RawVolusionProduct {
  return {
    ProductID: 5001,
    ProductCode: 'TSHIRT-BLU',
    ProductName: 'Blue T-Shirt',
    ProductDescription: '<p>A comfortable cotton tee.</p>',
    SEFriendlyName: 'blue-t-shirt',
    IsActive: true,
    Manufacturer: 'Acme Apparel',
    ProductCategory: 'Shirts',
    ProductPrice: 29.99,
    SalePrice: 24.99,
    FreeShippingItem: false,
    ProductWeight: 200,
    WeightUnit: 'g',
    TaxableProduct: true,
    Options: [
      { OptionID: 10, OptionName: 'Size', OptionSortOrder: 1, OptionValues: ['S', 'M', 'L'] },
    ],
    Variants: [
      {
        VariantID: 601,
        ProductCode: 'TSHIRT-BLU-S',
        VariantPrice: 29.99,
        VariantSalePrice: 24.99,
        VariantWeight: 200,
        StockQuantity: 50,
        OptionValues: { Size: 'S' },
      },
    ],
    Images: [
      {
        ImageID: 801,
        PathToImage: 'https://cdn.volusion.com/img/001.jpg',
        ImageAltText: 'Front view',
        SortOrder: 1,
      },
    ],
    DateCreated: '2024-01-10T12:00:00Z',
    LastModified: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformProduct', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('5001')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Blue T-Shirt')
    expect(result.handle).toBe('blue-t-shirt')
    expect(result.description).toBe('<p>A comfortable cotton tee.</p>')
    expect(result.vendor).toBe('Acme Apparel')
    expect(result.productType).toBe('Shirts')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps DRAFT status for inactive products', () => {
    const result = transformProduct(makeProduct({ IsActive: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps variants with option values', () => {
    const result = transformProduct(makeProduct())
    const variant = result.variants![0]!
    expect(variant.id).toBe('601')
    expect(variant.sku).toBe('TSHIRT-BLU-S')
    expect(variant.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(variant.compareAtPrice).toEqual({ amount: 2499, currency: 'USD' })
    expect(variant.optionValues).toEqual({ Size: 'S' })
  })

  it('creates a synthetic variant when none exist', () => {
    const result = transformProduct(makeProduct({ Variants: [] }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('5001')
    expect(result.variants![0]!.sku).toBe('TSHIRT-BLU')
    expect(result.variants![0]!.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(result.variants![0]!.taxable).toBe(true)
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.volusion.com/img/001.jpg')
    expect(result.images![0]!.alt).toBe('Front view')
  })

  it('maps options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(1)
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
    expect(raw.ProductName).toBe('Blue T-Shirt')
    expect(raw.ProductDescription).toBe('<p>A comfortable cotton tee.</p>')
    expect(raw.SEFriendlyName).toBe('blue-t-shirt')
    expect(raw.Manufacturer).toBe('Acme Apparel')
    expect(raw.IsActive).toBe(true)
  })
})

describe('transformVariant', () => {
  it('maps standalone variant fields', () => {
    const raw: RawVolusionVariant = {
      VariantID: 602,
      ProductCode: 'TSHIRT-BLU-M',
      VariantPrice: 29.99,
      VariantWeight: 210,
      OptionValues: { Size: 'M' },
    }
    const result = transformVariant(raw)
    expect(result.id).toBe('602')
    expect(result.sku).toBe('TSHIRT-BLU-M')
    expect(result.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(result.weight).toBe(210)
    expect(result.optionValues).toEqual({ Size: 'M' })
  })
})
