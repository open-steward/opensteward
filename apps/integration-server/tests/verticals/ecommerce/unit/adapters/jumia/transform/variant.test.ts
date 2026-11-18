import { describe, it, expect } from 'vitest'
import {
  extractVariants,
  findVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/jumia/transform/variant'
import type { RawJumiaProduct } from '../../../../../../../src/verticals/ecommerce/adapters/jumia/transform/product'

function makeProduct(): RawJumiaProduct {
  return {
    product_id: 987654,
    name: 'Samsung Galaxy Earbuds Pro',
    variations: [
      {
        sku_id: 'V001',
        seller_sku: 'EARBUDS-BLK',
        name: 'Black',
        price: 45000,
        quantity: 200,
      },
      {
        sku_id: 'V002',
        seller_sku: 'EARBUDS-WHT',
        name: 'White',
        price: 45000,
        quantity: 80,
      },
    ],
  }
}

describe('extractVariants (Jumia)', () => {
  it('extracts all variants from a product', () => {
    const variants = extractVariants(makeProduct(), 'NGN')
    expect(variants).toHaveLength(2)
    expect(variants[0]!.id).toBe('V001')
    expect(variants[0]!.productId).toBe('987654')
    expect(variants[1]!.id).toBe('V002')
  })

  it('returns empty array for product with no variations', () => {
    const product = { ...makeProduct(), variations: [] }
    expect(extractVariants(product, 'NGN')).toEqual([])
  })
})

describe('findVariant (Jumia)', () => {
  it('finds by sku_id', () => {
    const variant = findVariant(makeProduct(), 'V001', 'NGN')
    expect(variant).toBeDefined()
    expect(variant!.id).toBe('V001')
    expect(variant!.sku).toBe('EARBUDS-BLK')
  })

  it('finds by seller_sku', () => {
    const variant = findVariant(makeProduct(), 'EARBUDS-WHT', 'NGN')
    expect(variant).toBeDefined()
    expect(variant!.id).toBe('V002')
  })

  it('returns undefined for non-existent variant', () => {
    const variant = findVariant(makeProduct(), 'NONEXISTENT', 'NGN')
    expect(variant).toBeUndefined()
  })
})
