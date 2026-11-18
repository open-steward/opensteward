import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  type RawYokartProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/yokart/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawYokartProduct> = {}): RawYokartProduct {
  return {
    product_id: 42,
    product_name: 'Blue Sneakers',
    product_model: 'SNKR-BLUE-42',
    product_description: 'Comfortable blue sneakers',
    selprod_id: 99,
    selprod_title: 'Blue / Size 9',
    theprice: '€18.77',
    selprod_price: '€24.99',
    special_price_found: '1',
    in_stock: '1',
    brand_name: 'FooBrand',
    prodcat_name: 'Footwear',
    product_image_url: 'https://example.com/img.jpg',
    ...overrides,
  }
}

describe('transformProduct', () => {
  it('maps core product fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('42')
    expect(result.title).toBe('Blue Sneakers')
    expect(result.description).toBe('Comfortable blue sneakers')
    expect(result.vendor).toBe('FooBrand')
    expect(result.productType).toBe('Footwear')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps in_stock=0 to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ in_stock: '0' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps in_stock undefined to undefined status', () => {
    const result = transformProduct(makeProduct({ in_stock: undefined }))
    expect(result.status).toBeUndefined()
  })

  it('infers EUR currency from €-prefixed price', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants?.[0]?.price.currency).toBe('EUR')
    expect(result.variants?.[0]?.price.amount).toBe(1877)
  })

  it('applies compareAtPrice when special_price_found=1 and list price > effective price', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants?.[0]?.compareAtPrice).toEqual({ amount: 2499, currency: 'EUR' })
  })

  it('does NOT set compareAtPrice when special_price_found=0', () => {
    const result = transformProduct(makeProduct({ special_price_found: '0' }))
    if (result.variants === undefined) throw new Error('expected variants to be defined')
    expect(result.variants[0]!.compareAtPrice).toBeUndefined()
  })

  it('uses selprod_id as variant id', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants?.[0]?.id).toBe('99')
  })

  it('falls back to productId:default for variant id when selprod_id absent', () => {
    const result = transformProduct(makeProduct({ selprod_id: undefined }))
    expect(result.variants?.[0]?.id).toBe('42:default')
  })

  it('maps product_model to variant sku', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants?.[0]?.sku).toBe('SNKR-BLUE-42')
  })

  it('maps thumbnail image url', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://example.com/img.jpg')
  })

  it('prefers full images array over thumbnail when present', () => {
    const result = transformProduct(
      makeProduct({
        images: [
          { afile_id: 1, product_image_url: 'https://example.com/full1.jpg' },
          { afile_id: 2, product_image_url: 'https://example.com/full2.jpg' },
        ],
        product_image_url: 'https://example.com/thumb.jpg',
      }),
    )
    expect(result.images).toHaveLength(2)
    expect(result.images![0]!.url).toBe('https://example.com/full1.jpg')
    expect(result.images![0]!.id).toBe('1')
  })

  it('maps options array when present', () => {
    const result = transformProduct(
      makeProduct({
        options: [
          {
            option_id: 5,
            option_name: 'Color',
            optionValues: [
              { optionvalue_id: 10, optionvalue_name: 'Blue' },
              { optionvalue_id: 11, optionvalue_name: 'Red' },
            ],
          },
        ],
      }),
    )
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toEqual(['Blue', 'Red'])
  })

  it('infers USD for $ price', () => {
    const result = transformProduct(makeProduct({ theprice: '$19.99', selprod_price: '$24.99' }))
    expect(result.variants?.[0]?.price.currency).toBe('USD')
    expect(result.variants?.[0]?.price.amount).toBe(1999)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformVariant', () => {
  it('maps selprod_id as variant id', () => {
    const result = transformVariant(makeProduct(), '42')
    expect(result.id).toBe('99')
    expect(result.productId).toBe('42')
  })

  it('falls back to product_id from raw when productId not passed', () => {
    const result = transformVariant(makeProduct())
    expect(result.productId).toBe('42')
  })

  it('maps price and currency correctly', () => {
    const result = transformVariant(makeProduct())
    expect(result.price.amount).toBe(1877)
    expect(result.price.currency).toBe('EUR')
  })

  it('applies compareAtPrice when discount is active', () => {
    const result = transformVariant(makeProduct())
    expect(result.compareAtPrice).toEqual({ amount: 2499, currency: 'EUR' })
  })

  it('maps sku from product_model', () => {
    const result = transformVariant(makeProduct())
    expect(result.sku).toBe('SNKR-BLUE-42')
  })

  it('maps inventoryItemId to the selprod_id', () => {
    const result = transformVariant(makeProduct())
    expect(result.inventoryItemId).toBe('99')
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const result = transformVariant(makeProduct())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})
