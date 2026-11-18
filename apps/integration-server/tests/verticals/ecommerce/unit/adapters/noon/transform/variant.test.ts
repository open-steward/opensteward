import { describe, it, expect } from 'vitest'
import {
  extractVariants,
  findVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/noon/transform/variant'
import type { RawNoonProduct } from '../../../../../../../src/verticals/ecommerce/adapters/noon/transform/product'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(): RawNoonProduct {
  return {
    product_id: 'NP-12345',
    title: 'Samsung Galaxy Buds Pro',
    skus: [
      {
        sku: 'SKU-BUDS-BLK',
        seller_sku: 'SELLER-BUDS-BLK',
        price: 599,
        sale_price: 499,
        options: { color: 'Black' },
      },
      {
        sku: 'SKU-BUDS-WHT',
        seller_sku: 'SELLER-BUDS-WHT',
        price: 599,
        options: { color: 'White' },
      },
    ],
  }
}

describe('extractVariants (Noon)', () => {
  it('extracts all variants from a product', () => {
    const variants = extractVariants(makeProduct(), 'AED')
    expect(variants).toHaveLength(2)
    expect(variants[0]!.id).toBe('SKU-BUDS-BLK')
    expect(variants[0]!.productId).toBe('NP-12345')
    expect(variants[0]!.price).toEqual({ amount: 599, currency: 'AED' })
    expect(variants[1]!.id).toBe('SKU-BUDS-WHT')
  })

  it('returns empty array for product with no SKUs', () => {
    const product: RawNoonProduct = { product_id: 'NP-99', skus: [] }
    expect(extractVariants(product)).toEqual([])
  })

  it('each variant satisfies ProductVariantSchema', () => {
    const variants = extractVariants(makeProduct(), 'AED')
    for (const v of variants) {
      expect(() => ProductVariantSchema.parse(v)).not.toThrow()
    }
  })
})

describe('findVariant (Noon)', () => {
  it('finds a variant by sku', () => {
    const variant = findVariant(makeProduct(), 'SKU-BUDS-BLK', 'AED')
    expect(variant).toBeDefined()
    expect(variant!.id).toBe('SKU-BUDS-BLK')
    expect(variant!.compareAtPrice).toEqual({ amount: 499, currency: 'AED' })
  })

  it('finds a variant by seller_sku', () => {
    const variant = findVariant(makeProduct(), 'SELLER-BUDS-WHT', 'AED')
    expect(variant).toBeDefined()
    expect(variant!.id).toBe('SKU-BUDS-WHT')
  })

  it('returns undefined for unknown variant', () => {
    const variant = findVariant(makeProduct(), 'NONEXISTENT', 'AED')
    expect(variant).toBeUndefined()
  })
})
