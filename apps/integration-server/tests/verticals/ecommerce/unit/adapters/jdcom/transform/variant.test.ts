import { describe, it, expect } from 'vitest'
import {
  transformVariant,
  transformVariants,
  type RawJdVariantSku,
} from '../../../../../../../src/verticals/ecommerce/adapters/jdcom/transform/variant'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariantSku(overrides: Partial<RawJdVariantSku> = {}): RawJdVariantSku {
  return {
    sku_id: 10086001,
    ware_id: 50001,
    outer_id: 'SELLER-SKU-001',
    upc_code: '6901443698752',
    jd_price: 6999.00,
    market_price: 7999.00,
    title: '华为Mate 60 Pro 雅丹黑',
    sale_attrs: [
      { attr_name: '颜色', attr_value: '雅丹黑' },
      { attr_name: '版本', attr_value: '12GB+512GB' },
    ],
    stock_num: 150,
    ...overrides,
  }
}

describe('transformVariant (JD.com)', () => {
  it('uses sku_id as the canonical id', () => {
    const result = transformVariant(makeVariantSku())
    expect(result.id).toBe('10086001')
  })

  it('maps ware_id to productId', () => {
    const result = transformVariant(makeVariantSku())
    expect(result.productId).toBe('50001')
  })

  it('builds title from option values', () => {
    const result = transformVariant(makeVariantSku())
    expect(result.title).toBe('雅丹黑 / 12GB+512GB')
  })

  it('falls back to SKU title when no sale_attrs', () => {
    const result = transformVariant(makeVariantSku({ sale_attrs: undefined }))
    expect(result.title).toBe('华为Mate 60 Pro 雅丹黑')
  })

  it('falls back to SKU {id} when no title and no sale_attrs', () => {
    const result = transformVariant(makeVariantSku({ sale_attrs: undefined, title: undefined }))
    expect(result.title).toBe('SKU 10086001')
  })

  it('maps jd_price as price in CNY', () => {
    const result = transformVariant(makeVariantSku())
    expect(result.price).toEqual({ amount: 6999, currency: 'CNY' })
  })

  it('includes compareAtPrice when market_price > jd_price', () => {
    const result = transformVariant(makeVariantSku())
    expect(result.compareAtPrice).toEqual({ amount: 7999, currency: 'CNY' })
  })

  it('omits compareAtPrice when prices are equal', () => {
    const result = transformVariant(makeVariantSku({ jd_price: 6999, market_price: 6999 }))
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('includes barcode from upc_code', () => {
    const result = transformVariant(makeVariantSku())
    expect(result.barcode).toBe('6901443698752')
  })

  it('includes sku from outer_id', () => {
    const result = transformVariant(makeVariantSku())
    expect(result.sku).toBe('SELLER-SKU-001')
  })

  it('builds optionValues from sale_attrs', () => {
    const result = transformVariant(makeVariantSku())
    expect(result.optionValues).toEqual({
      '颜色': '雅丹黑',
      '版本': '12GB+512GB',
    })
  })

  it('omits optionValues when no sale_attrs', () => {
    const result = transformVariant(makeVariantSku({ sale_attrs: undefined }))
    expect(result.optionValues).toBeUndefined()
  })

  it('satisfies ProductVariantSchema', () => {
    const result = transformVariant(makeVariantSku())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('preserves raw data in metadata', () => {
    const result = transformVariant(makeVariantSku())
    expect(result.metadata['sku_id']).toBe(10086001)
  })
})

describe('transformVariants (JD.com)', () => {
  it('transforms an array of SKUs', () => {
    const results = transformVariants([
      makeVariantSku({ sku_id: 1 }),
      makeVariantSku({ sku_id: 2 }),
    ])
    expect(results).toHaveLength(2)
    expect(results[0]!.id).toBe('1')
    expect(results[1]!.id).toBe('2')
  })

  it('returns empty array for empty input', () => {
    expect(transformVariants([])).toHaveLength(0)
  })
})
