import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawQuickbutikProduct,
  type RawQuickbutikVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/quickbutik/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawQuickbutikProduct> = {}): RawQuickbutikProduct {
  return {
    id: 101,
    title: 'Test Shirt',
    visible: true,
    price: '149.00',
    qty: '10',
    date_modified: '2025-01-29 11:35:39',
    hasVariants: false,
    ...overrides,
  }
}

function makeVariant(overrides: Partial<RawQuickbutikVariant> = {}): RawQuickbutikVariant {
  return {
    id: 55,
    price: '99.00',
    qty: '3',
    sku: 'SKU-55',
    ...overrides,
  }
}

describe('transformProduct', () => {
  it('synthesises a single :default variant for a simple product', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants?.[0]?.id).toBe('101:default')
    expect(result.variants?.[0]?.productId).toBe('101')
  })

  it('maps id and title correctly', () => {
    const result = transformProduct(makeProduct({ id: 42, title: 'My Product' }))
    expect(result.id).toBe('42')
    expect(result.title).toBe('My Product')
  })

  it('converts price decimal string to minor units', () => {
    // "149.00" EUR → majorToMinor(149, "EUR") = 14900
    const result = transformProduct(makeProduct({ price: '149.00' }), 'EUR')
    expect(result.variants?.[0]?.price.amount).toBe(14900)
    expect(result.variants?.[0]?.price.currency).toBe('EUR')
  })

  it('converts SEK price decimal string to minor units', () => {
    // "149.00" SEK → majorToMinor(149, "SEK") = 14900 (SEK exponent=2)
    const result = transformProduct(makeProduct({ price: '149.00' }), 'SEK')
    expect(result.variants?.[0]?.price.amount).toBe(14900)
    expect(result.variants?.[0]?.price.currency).toBe('SEK')
  })

  it('maps visible:true → status ACTIVE', () => {
    const result = transformProduct(makeProduct({ visible: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps visible:false → status DRAFT', () => {
    const result = transformProduct(makeProduct({ visible: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('converts space-separated date_modified to ISO with Z', () => {
    const result = transformProduct(makeProduct({ date_modified: '2025-01-29 11:35:39' }))
    expect(result.updatedAt).toBe('2025-01-29T11:35:39Z')
  })

  it('maps each variant to {productId}:{variantId}', () => {
    const raw = makeProduct({
      id: 10,
      hasVariants: true,
      variants: [
        { id: 20, price: '50.00' },
        { id: 21, price: '60.00' },
      ],
    })
    const result = transformProduct(raw, 'SEK')
    expect(result.variants).toHaveLength(2)
    expect(result.variants?.[0]?.id).toBe('10:20')
    expect(result.variants?.[1]?.id).toBe('10:21')
  })

  it('falls back to synthesised default variant when hasVariants=true but variants array is empty', () => {
    const raw = makeProduct({ hasVariants: true, variants: [] })
    const result = transformProduct(raw)
    expect(result.variants).toHaveLength(1)
    expect(result.variants?.[0]?.id).toContain(':default')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformVariant', () => {
  it('builds composite id from productId and variant id', () => {
    const result = transformVariant(makeVariant({ id: 77 }), '5', 'EUR')
    expect(result.id).toBe('5:77')
    expect(result.productId).toBe('5')
  })

  it('converts price to minor units', () => {
    const result = transformVariant(makeVariant({ price: '20.50' }), '1', 'EUR')
    expect(result.price.amount).toBe(2050)
    expect(result.price.currency).toBe('EUR')
  })

  it('maps option values from values array', () => {
    const raw = makeVariant({
      values: [
        { name: 'Color', value: 'Red' },
        { name: 'Size', value: 'M' },
      ],
    })
    const result = transformVariant(raw, '1', 'SEK')
    expect(result.optionValues).toEqual({ Color: 'Red', Size: 'M' })
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const result = transformVariant(makeVariant(), '1', 'EUR')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct', () => {
  it('maps title and status ACTIVE → visible:true', () => {
    const body = untransformProduct({ title: 'My Shirt', status: 'ACTIVE' })
    expect(body['title']).toBe('My Shirt')
    expect(body['visible']).toBe(true)
  })

  it('maps status DRAFT → visible:false', () => {
    const body = untransformProduct({ status: 'DRAFT' })
    expect(body['visible']).toBe(false)
  })

  it('maps status ARCHIVED → visible:false', () => {
    const body = untransformProduct({ status: 'ARCHIVED' })
    expect(body['visible']).toBe(false)
  })
})

describe('untransformVariant', () => {
  it('converts minor-unit price back to decimal string', () => {
    const body = untransformVariant({ price: { amount: 1999, currency: 'EUR' } })
    expect(body['price']).toBe('19.99')
  })

  it('maps sku and barcode fields', () => {
    const body = untransformVariant({ sku: 'ABC-123', barcode: '9876543210' })
    expect(body['sku']).toBe('ABC-123')
    expect(body['gtin']).toBe('9876543210')
  })
})
