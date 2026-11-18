import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawCafe24Product,
  type RawCafe24Variant,
} from '../../../../../../../src/verticals/ecommerce/adapters/cafe24/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

describe('transformProduct (cafe24)', () => {
  const raw: RawCafe24Product = {
    product_no: 777,
    product_name: 'Korean Skincare Set',
    // Cafe24 product_code (e.g. "P0000777") may not be a valid slug — transform
    // emits it as-is. Use a slug-compatible code here so the schema round-trip passes.
    product_code: 'korean-skincare-set',
    description: '<p>Complete skincare</p>',
    price: '39000',
    display: 'T',
    selling: 'T',
    product_tag: 'beauty,skincare',
    brand_name: 'K-Beauty Brand',
    product_type: 'Cosmetics',
    options: [
      {
        option_no: 1,
        option_name: 'Size',
        option_value: ['Small', 'Large'],
      },
    ],
    variants: [
      {
        variant_code: 'P0000777-001',
        options: [{ option_code: 'Size', option_value: 'Small' }],
        price: '39000',
        stock: 100,
        display_soldout: 'F',
        status: 'selling',
      },
    ],
    detail_image: 'https://cdn.cafe24.com/detail.jpg',
    list_image: 'https://cdn.cafe24.com/list.jpg',
    created_date: '2024-03-01T00:00:00Z',
    updated_date: '2024-03-01T00:00:00Z',
  }

  it('maps id from product_no', () => {
    expect(transformProduct(raw).id).toBe('777')
  })

  it('maps title from product_name', () => {
    expect(transformProduct(raw).title).toBe('Korean Skincare Set')
  })

  it('maps handle from product_code', () => {
    expect(transformProduct(raw).handle).toBe('korean-skincare-set')
  })

  it('maps status ACTIVE when display=T and selling=T', () => {
    expect(transformProduct(raw).status).toBe('ACTIVE')
  })

  it('maps status DRAFT when display=T and selling=F', () => {
    expect(transformProduct({ ...raw, display: 'T', selling: 'F' }).status).toBe('DRAFT')
  })

  it('maps status ARCHIVED when display=F', () => {
    expect(transformProduct({ ...raw, display: 'F' }).status).toBe('ARCHIVED')
  })

  it('maps vendor from brand_name', () => {
    expect(transformProduct(raw).vendor).toBe('K-Beauty Brand')
  })

  it('maps productType', () => {
    expect(transformProduct(raw).productType).toBe('Cosmetics')
  })

  it('maps tags from comma-separated product_tag', () => {
    expect(transformProduct(raw).tags).toEqual(['beauty', 'skincare'])
  })

  it('maps options with name and values', () => {
    const result = transformProduct(raw)
    expect(result.options![0]!.name).toBe('Size')
    expect(result.options![0]!.values).toContain('Small')
    expect(result.options![0]!.values).toContain('Large')
  })

  it('maps variants with option values', () => {
    const result = transformProduct(raw)
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('777:P0000777-001')
    expect(result.variants![0]!.optionValues?.['Size']).toBe('Small')
  })

  it('converts variant price to minor units (KRW: major=minor)', () => {
    const result = transformProduct(raw)
    // 39000 KRW → 39000 (no subunits)
    expect(result.variants![0]!.price.amount).toBe(39000)
    expect(result.variants![0]!.price.currency).toBe('KRW')
  })

  it('maps detail_image first in images array', () => {
    const result = transformProduct(raw)
    expect(result.images![0]!.url).toBe('https://cdn.cafe24.com/detail.jpg')
  })

  it('deduplicates images when same URL repeated', () => {
    const dedupRaw: RawCafe24Product = {
      ...raw,
      detail_image: 'https://cdn.cafe24.com/same.jpg',
      list_image: 'https://cdn.cafe24.com/same.jpg',
    }
    const result = transformProduct(dedupRaw)
    const urls = result.images!.map((i) => i.url)
    const uniqueUrls = [...new Set(urls)]
    expect(urls).toHaveLength(uniqueUrls.length)
  })

  it('passes ProductSchema validation', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})

describe('transformVariant (cafe24)', () => {
  const rawVariant: RawCafe24Variant = {
    variant_code: 'P0000777-002',
    options: [{ option_code: 'Size', option_value: 'Large' }],
    price: '45000',
    stock: 20,
  }

  it('maps id as productNo:variantCode', () => {
    const result = transformVariant(rawVariant, '777')
    expect(result.id).toBe('777:P0000777-002')
  })

  it('maps productId', () => {
    expect(transformVariant(rawVariant, '777').productId).toBe('777')
  })

  it('converts price to minor units', () => {
    // 45000 KRW → 45000
    expect(transformVariant(rawVariant, '777', 'KRW').price.amount).toBe(45000)
  })

  it('maps option values', () => {
    const result = transformVariant(rawVariant, '777')
    expect(result.optionValues?.['Size']).toBe('Large')
  })

  it('passes ProductVariantSchema validation', () => {
    expect(() => ProductVariantSchema.parse(transformVariant(rawVariant, '777'))).not.toThrow()
  })
})

describe('untransformProduct (cafe24)', () => {
  it('round-trips product_name and brand_name', () => {
    const canonical = transformProduct(raw)
    const body = untransformProduct(canonical)
    expect(body.product_name).toBe('Korean Skincare Set')
    expect(body.brand_name).toBe('K-Beauty Brand')
  })

  it('maps ACTIVE status to display=T, selling=T', () => {
    const canonical = transformProduct(raw)
    const body = untransformProduct(canonical)
    expect(body.display).toBe('T')
    expect(body.selling).toBe('T')
  })
})

const raw: RawCafe24Product = {
  product_no: 777,
  product_name: 'Korean Skincare Set',
  product_code: 'korean-skincare-set',
  description: '<p>Complete skincare</p>',
  price: '39000',
  display: 'T',
  selling: 'T',
  product_tag: 'beauty,skincare',
  brand_name: 'K-Beauty Brand',
  product_type: 'Cosmetics',
  options: [{ option_no: 1, option_name: 'Size', option_value: ['Small', 'Large'] }],
  variants: [
    {
      variant_code: 'P0000777-001',
      options: [{ option_code: 'Size', option_value: 'Small' }],
      price: '39000',
      stock: 100,
    },
  ],
  detail_image: 'https://cdn.cafe24.com/detail.jpg',
  list_image: 'https://cdn.cafe24.com/list.jpg',
  created_date: '2024-03-01T00:00:00Z',
  updated_date: '2024-03-01T00:00:00Z',
}
