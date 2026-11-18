import { describe, it, expect } from 'vitest'
import {
  extractVariants,
  findVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/lazada/transform/variant'
import type { RawLazadaProduct } from '../../../../../../../src/verticals/ecommerce/adapters/lazada/transform/product'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(): RawLazadaProduct {
  return {
    item_id: 123456789,
    skus: [
      {
        SkuId: 901,
        SellerSku: 'EARBUDS-BLK',
        price: '29.99',
        special_price: '24.99',
        quantity: 100,
        package_weight: '0.15',
      },
      {
        SkuId: 902,
        SellerSku: 'EARBUDS-WHT',
        price: '29.99',
        quantity: 50,
      },
    ],
  }
}

describe('extractVariants (Lazada)', () => {
  it('extracts all SKUs as variants', () => {
    const variants = extractVariants(makeProduct(), 'SGD')
    expect(variants).toHaveLength(2)
    expect(variants[0]!.id).toBe('901')
    expect(variants[0]!.productId).toBe('123456789')
    expect(variants[0]!.sku).toBe('EARBUDS-BLK')
    expect(variants[0]!.price).toEqual({ amount: 2999, currency: 'SGD' })
  })

  it('produces variants that satisfy ProductVariantSchema', () => {
    const variants = extractVariants(makeProduct(), 'SGD')
    for (const v of variants) {
      expect(() => ProductVariantSchema.parse(v)).not.toThrow()
    }
  })

  it('returns empty array for product with no SKUs', () => {
    const variants = extractVariants({ item_id: 1, skus: [] }, 'SGD')
    expect(variants).toHaveLength(0)
  })
})

describe('findVariant (Lazada)', () => {
  it('finds variant by SkuId', () => {
    const v = findVariant(makeProduct(), '901', 'SGD')
    expect(v).toBeDefined()
    expect(v!.id).toBe('901')
    expect(v!.sku).toBe('EARBUDS-BLK')
  })

  it('finds variant by SellerSku', () => {
    const v = findVariant(makeProduct(), 'EARBUDS-WHT', 'SGD')
    expect(v).toBeDefined()
    expect(v!.id).toBe('902')
  })

  it('returns undefined for non-existent variant', () => {
    const v = findVariant(makeProduct(), 'NONEXISTENT', 'SGD')
    expect(v).toBeUndefined()
  })
})
