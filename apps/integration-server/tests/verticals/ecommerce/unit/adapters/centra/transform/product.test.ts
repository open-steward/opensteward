import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  groupProductItems,
  untransformProduct,
  untransformVariant,
  type RawCentraProductItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/centra/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawCentraProductItem> = {}): RawCentraProductItem {
  return {
    productId: 201,
    product: 'blue-shirt-internal',
    name: 'Blue Shirt',
    sku: 'SHIRT',
    variantId: 401,
    variant: 'Blue',
    variantSku: 'SHIRT-BLUE',
    stockItemId: 4001,
    size: 'XL',
    sizeSku: 'SHIRT-BLUE-XL',
    ean: '4011234567890',
    weight: '0.5',
    weightUnit: 'kg',
    active: true,
    images: ['https://centra.example.com/img.jpg'],
    prices: [{ id: 1, pricelist: 'default', price: '1200.00', currency: 'SEK' }],
    categories: [{ categoryId: 10, name: 'Tops' }],
    created: '2024-01-01T00:00:00Z',
    modified: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformVariant', () => {
  it('maps stockItemId to id string', () => {
    const result = transformVariant(makeItem())
    expect(result.id).toBe('4001')
  })

  it('falls back to variantId when stockItemId absent', () => {
    const result = transformVariant(makeItem({ stockItemId: undefined }))
    expect(result.id).toBe('401')
  })

  it('maps productId to string', () => {
    const result = transformVariant(makeItem())
    expect(result.productId).toBe('201')
  })

  it('uses sizeSku as sku (most specific)', () => {
    const result = transformVariant(makeItem())
    expect(result.sku).toBe('SHIRT-BLUE-XL')
  })

  it('falls back to variantSku when sizeSku absent', () => {
    const result = transformVariant(makeItem({ sizeSku: undefined }))
    expect(result.sku).toBe('SHIRT-BLUE')
  })

  it('maps ean to barcode', () => {
    const result = transformVariant(makeItem())
    expect(result.barcode).toBe('4011234567890')
  })

  it('picks price from prices array and converts to minor units (SEK)', () => {
    // 1200.00 SEK → 120000 minor units
    const result = transformVariant(makeItem())
    expect(result.price).toEqual({ amount: 120000, currency: 'SEK' })
  })

  it('builds optionValues from variant and size', () => {
    const result = transformVariant(makeItem())
    expect(result.optionValues).toEqual({ Variant: 'Blue', Size: 'XL' })
  })

  it('maps weight unit "kg"', () => {
    const result = transformVariant(makeItem())
    expect(result.weightUnit).toBe('kg')
  })
})

describe('transformProduct', () => {
  it('maps productId to id string', () => {
    const result = transformProduct(makeItem())
    expect(result.id).toBe('201')
  })

  it('maps external name to title', () => {
    const result = transformProduct(makeItem())
    expect(result.title).toBe('Blue Shirt')
  })

  it('maps active:true to ACTIVE status', () => {
    const result = transformProduct(makeItem())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps active:false to DRAFT status', () => {
    const result = transformProduct(makeItem({ active: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps category name to productType', () => {
    const result = transformProduct(makeItem())
    expect(result.productType).toBe('Tops')
  })

  it('maps category names to tags', () => {
    const result = transformProduct(makeItem())
    expect(result.tags).toEqual(['Tops'])
  })

  it('maps images as URL array', () => {
    const result = transformProduct(makeItem())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://centra.example.com/img.jpg')
  })

  it('maps createdAt and updatedAt (toIsoDatetime normalizes to .000Z form)', () => {
    const result = transformProduct(makeItem())
    // toIsoDatetime converts via new Date().toISOString() which emits .000Z milliseconds
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeItem())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('groupProductItems', () => {
  it('groups items by productId into distinct products', () => {
    const items: RawCentraProductItem[] = [
      makeItem({ stockItemId: 4001, size: 'XL' }),
      makeItem({ stockItemId: 4002, size: 'XXL' }),
      makeItem({ productId: 202, stockItemId: 5001, name: 'Red Shirt' }),
    ]
    const products = groupProductItems(items)
    expect(products).toHaveLength(2)
    const p201 = products.find((p) => p.id === '201')!
    expect(p201.variants).toHaveLength(2)
  })
})

describe('untransformProduct / untransformVariant', () => {
  it('round-trips active status', () => {
    const canonical = transformProduct(makeItem())
    const raw = untransformProduct(canonical)
    expect(raw.active).toBe(true)
    expect(raw.name).toBe('Blue Shirt')
  })

  it('round-trips variant sizeSku', () => {
    const variant = transformVariant(makeItem())
    const raw = untransformVariant(variant)
    expect(raw.sizeSku).toBe('SHIRT-BLUE-XL')
    expect(raw.ean).toBe('4011234567890')
  })
})
