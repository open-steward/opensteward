import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawShoperProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoper/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRawProduct(overrides: Partial<RawShoperProduct> = {}): RawShoperProduct {
  return {
    product_id: 801,
    code: 'lap-001',
    ean: '5901234123457',
    translations: {
      pl_PL: {
        name: 'Laptop',
        description: '<p>Wydajny laptop</p>',
        active: 1,
      },
    },
    stock: {
      price: '2499.99',
      price_old: '2999.99',
      stock: 10,
      weight: '2.5',
      weight_type: 'kg',
    },
    images: [{ image_id: 1001, name: 'https://cdn.shoper.pl/laptop.jpg', order: 0 }],
    add_date: '2023-09-01T00:00:00.000Z',
    edit_date: '2024-04-05T14:00:00.000Z',
    ...overrides,
  }
}

describe('shoper transformProduct', () => {
  it('maps product_id to string id', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.id).toBe('801')
  })

  it('picks pl_PL translation for title', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.title).toBe('Laptop')
  })

  it('maps description from translation', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.description).toBe('<p>Wydajny laptop</p>')
  })

  it('maps active translation to ACTIVE status', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps code to handle', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.handle).toBe('lap-001')
  })

  it('produces output that passes ProductSchema', () => {
    const result = transformProduct(makeRawProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformProduct', () => {
    const canonical = transformProduct(makeRawProduct())
    const back = untransformProduct(canonical)
    expect(back.code).toBe('lap-001')
    const translations = back.translations as Record<string, { name: string }>
    expect(translations?.['pl_PL']?.name).toBe('Laptop')
  })
})

describe('shoper transformVariant', () => {
  it('maps product_id to string id (Shoper child products)', () => {
    const result = transformVariant(makeRawProduct())
    expect(result.id).toBe('801')
  })

  it('maps stock.price to minor units (PLN: ×100)', () => {
    // 2499.99 PLN = 249999 gr
    const result = transformVariant(makeRawProduct(), 'PLN')
    expect(result.price.amount).toBe(249999)
    expect(result.price.currency).toBe('PLN')
  })

  it('maps stock.price_old to compareAtPrice in minor units', () => {
    const result = transformVariant(makeRawProduct(), 'PLN')
    // 2999.99 PLN = 299999 gr
    expect(result.compareAtPrice?.amount).toBe(299999)
  })

  it('maps ean as barcode', () => {
    const result = transformVariant(makeRawProduct())
    expect(result.barcode).toBe('5901234123457')
  })

  it('maps weight and weightUnit', () => {
    const result = transformVariant(makeRawProduct())
    expect(result.weight).toBe(2.5)
    expect(result.weightUnit).toBe('kg')
  })

  it('produces output that passes ProductVariantSchema', () => {
    const result = transformVariant(makeRawProduct(), 'PLN')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformVariant', () => {
    const canonical = transformVariant(makeRawProduct(), 'PLN')
    const back = untransformVariant(canonical)
    expect(back.ean).toBe('5901234123457')
    expect(back.code).toBe('lap-001')
  })
})
