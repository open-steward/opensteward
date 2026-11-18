import { describe, it, expect } from 'vitest'
import {
  transformVariant,
  transformVariants,
  type RawTikTokSku,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiktok-shop/transform/variant'

function makeSku(overrides: Partial<RawTikTokSku> = {}): RawTikTokSku {
  return {
    id: 'sku-100',
    seller_sku: 'WBE-PRO-BLK-M',
    price: {
      currency: 'USD',
      original_price: '59.99',
      sale_price: '49.99',
    },
    sales_attributes: [
      { id: 'attr-1', name: 'Color', value_id: 'val-1', value_name: 'Black' },
      { id: 'attr-2', name: 'Size', value_id: 'val-2', value_name: 'M' },
    ],
    ...overrides,
  }
}

describe('transformVariant (TikTok Shop)', () => {
  it('uses SKU id as the canonical id', () => {
    const result = transformVariant(makeSku(), 'prod-1')
    expect(result.id).toBe('sku-100')
    expect(result.productId).toBe('prod-1')
  })

  it('maps seller_sku to sku field', () => {
    const result = transformVariant(makeSku(), 'prod-1')
    expect(result.sku).toBe('WBE-PRO-BLK-M')
  })

  it('extracts sale price and compare-at price', () => {
    const result = transformVariant(makeSku(), 'prod-1')
    expect(result.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(result.compareAtPrice).toEqual({ amount: 5999, currency: 'USD' })
  })

  it('omits compareAtPrice when original equals sale', () => {
    const result = transformVariant(
      makeSku({
        price: { currency: 'USD', original_price: '49.99', sale_price: '49.99' },
      }),
      'prod-1',
    )
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('builds title from sales attributes', () => {
    const result = transformVariant(makeSku(), 'prod-1')
    expect(result.title).toBe('Black / M')
  })

  it('falls back to SKU id for title when no attributes', () => {
    const result = transformVariant(
      makeSku({ sales_attributes: undefined }),
      'prod-1',
    )
    expect(result.title).toBe('SKU sku-100')
  })

  it('maps sales attributes to optionValues', () => {
    const result = transformVariant(makeSku(), 'prod-1')
    expect(result.optionValues).toEqual({ Color: 'Black', Size: 'M' })
  })

  it('preserves raw SKU in metadata', () => {
    const raw = makeSku()
    const result = transformVariant(raw, 'prod-1')
    expect(result.metadata['id']).toBe('sku-100')
    expect(result.metadata['seller_sku']).toBe('WBE-PRO-BLK-M')
  })
})

describe('transformVariants (TikTok Shop)', () => {
  it('transforms multiple SKUs', () => {
    const skus = [
      makeSku({ id: 'sku-1' }),
      makeSku({ id: 'sku-2', seller_sku: 'WBE-PRO-WHT-M' }),
    ]
    const result = transformVariants(skus, 'prod-1')
    expect(result).toHaveLength(2)
    expect(result[0]!.id).toBe('sku-1')
    expect(result[1]!.id).toBe('sku-2')
  })

  it('returns empty array for empty SKU list', () => {
    const result = transformVariants([], 'prod-1')
    expect(result).toHaveLength(0)
  })
})
