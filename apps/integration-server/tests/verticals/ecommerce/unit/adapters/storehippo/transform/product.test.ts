import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawStoreHippoProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/storehippo/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'
import { PRODUCT } from '../fixtures'

const raw = (): RawStoreHippoProduct => structuredClone(PRODUCT) as RawStoreHippoProduct

describe('StoreHippo transformProduct (documented ms-products fields)', () => {
  it('maps the documented example and parses with ProductSchema', () => {
    const p = ProductSchema.parse(transformProduct(raw(), 'INR'))
    expect(p.id).toBe('5c3f3c724b99c515ee8f53d8')
    expect(p.title).toBe('Floral shirt')
    expect(p.handle).toBe('floral-shirt')
    expect(p.description).toBe('Regular fit, cotton floral shirt')
    expect(p.vendor).toBe('Lee Cooper')
    expect(p.status).toBe('ACTIVE')
    expect(p.createdAt).toBe('2020-05-08T11:04:21.355Z')
    expect(p.options).toEqual([
      { name: 'Fit Size', values: ['S-39', 'M-40', 'L-42', 'XL-44'], position: 0 },
      { name: 'Color', values: ['red', 'black', 'blue'], position: 1 },
    ])
  })

  it('maps the documented variants example with ids {product _id}:{variant_id}', () => {
    const p = transformProduct(raw(), 'INR')
    expect(p.variants?.map((v) => v.id)).toEqual([
      '5c3f3c724b99c515ee8f53d8:blue',
      '5c3f3c724b99c515ee8f53d8:gold',
    ])
    const blue = ProductVariantSchema.parse(p.variants![0])
    expect(blue.productId).toBe('5c3f3c724b99c515ee8f53d8')
    expect(blue.sku).toBe('TSHIRT_BLUE')
    expect(blue.price).toEqual({ amount: 30000, currency: 'INR' })
    expect(blue.compareAtPrice).toEqual({ amount: 35000, currency: 'INR' })
    expect(blue.optionValues).toEqual({ color: 'blue' })
  })

  it('prices in the currency it is given, never a default', () => {
    const p = transformProduct(raw(), 'USD')
    expect(p.variants![1]!.price).toEqual({ amount: 40000, currency: 'USD' })
  })

  it('publish "0" is DRAFT; a product without variants has none', () => {
    const p = ProductSchema.parse(transformProduct({ ...raw(), publish: '0', variants: [] }, 'INR'))
    expect(p.status).toBe('DRAFT')
    expect(p.variants).toBeUndefined()
  })

  it('omits a handle the canonical slug would reject', () => {
    const p = ProductSchema.parse(transformProduct({ ...raw(), alias: 'Children-Wear' }, 'INR'))
    expect(p.handle).toBeUndefined()
  })

  it('throws on a record without _id or name', () => {
    expect(() => transformProduct({ ...raw(), _id: undefined }, 'INR')).toThrow(/_id/)
    expect(() => transformProduct({ ...raw(), name: undefined }, 'INR')).toThrow(/name/)
  })

  it('throws on a variant without variant_id or a numeric price instead of inventing one', () => {
    expect(() => transformVariant({ price: '300' }, 'p1', 'INR')).toThrow(/variant_id/)
    expect(() => transformVariant({ variant_id: 'blue' }, 'p1', 'INR')).toThrow(/price/)
  })

  it('untransformProduct still maps the title to name', () => {
    expect(untransformProduct({ title: 'Floral shirt' })['name']).toBe('Floral shirt')
  })
})
