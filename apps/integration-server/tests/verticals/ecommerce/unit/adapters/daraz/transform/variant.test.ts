import { describe, it, expect } from 'vitest'
import {
  extractVariants,
  findVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/daraz/transform/variant'
import type { RawDarazProduct } from '../../../../../../../src/verticals/ecommerce/adapters/daraz/transform/product'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRaw(): RawDarazProduct {
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

describe('extractVariants (Daraz)', () => {
  it('extracts all SKUs as variants', () => {
    const variants = extractVariants(makeRaw(), 'PKR')
    expect(variants).toHaveLength(2)
    expect(variants[0]!.id).toBe('901')
    expect(variants[0]!.productId).toBe('123456789')
    expect(variants[0]!.sku).toBe('EARBUDS-BLK')
    expect(variants[0]!.price).toEqual({ amount: 2999, currency: 'PKR' })
  })

  it('produces variants that satisfy ProductVariantSchema', () => {
    const variants = extractVariants(makeRaw(), 'PKR')
    for (const v of variants) {
      expect(() => ProductVariantSchema.parse(v)).not.toThrow()
    }
  })

  it('returns empty array for product with no SKUs', () => {
    const variants = extractVariants({ item_id: 1, skus: [] }, 'PKR')
    expect(variants).toHaveLength(0)
  })

  it('uses USD as default currency', () => {
    const variants = extractVariants(makeRaw())
    expect(variants[0]!.price.currency).toBe('USD')
  })

  it('maps weight and weightUnit from package_weight', () => {
    const variants = extractVariants(makeRaw(), 'PKR')
    expect(variants[0]!.weight).toBe(0.15)
    expect(variants[0]!.weightUnit).toBe('kg')
    expect(variants[1]!.weight).toBeUndefined()
    expect(variants[1]!.weightUnit).toBeUndefined()
  })

  it('preserves raw SKU in variant metadata', () => {
    const variants = extractVariants(makeRaw(), 'PKR')
    expect(variants[0]!.metadata['SkuId']).toBe(901)
  })
})

describe('findVariant (Daraz)', () => {
  it('finds variant by SkuId', () => {
    const v = findVariant(makeRaw(), '901', 'PKR')
    expect(v).toBeDefined()
    expect(v!.id).toBe('901')
    expect(v!.sku).toBe('EARBUDS-BLK')
  })

  it('finds variant by SellerSku', () => {
    const v = findVariant(makeRaw(), 'EARBUDS-WHT', 'PKR')
    expect(v).toBeDefined()
    expect(v!.id).toBe('902')
  })

  it('returns undefined for non-existent variant', () => {
    const v = findVariant(makeRaw(), 'NONEXISTENT', 'PKR')
    expect(v).toBeUndefined()
  })

  it('uses USD as default currency', () => {
    const v = findVariant(makeRaw(), '901')
    expect(v!.price.currency).toBe('USD')
  })
})
