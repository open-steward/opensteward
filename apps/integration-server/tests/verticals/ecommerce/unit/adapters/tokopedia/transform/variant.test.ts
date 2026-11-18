import { describe, it, expect } from 'vitest'
import {
  transformVariant,
  type RawTokopediaVariantData,
} from '../../../../../../../src/verticals/ecommerce/adapters/tokopedia/transform/variant'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawTokopediaVariantData> = {}): RawTokopediaVariantData {
  return {
    productID: 111222333,
    name: 'Batik Silk Shirt - Blue / L',
    sku: 'BSS-BLUE-L',
    price: 350000,
    priceCurrency: 'IDR',
    stock: 25,
    status: 1,
    optionValues: [
      { name: 'Color', value: 'Blue' },
      { name: 'Size', value: 'L' },
    ],
    weight: 200,
    weightUnit: 'GR',
    ...overrides,
  }
}

describe('transformVariant (Tokopedia)', () => {
  it('uses productID as the variant id', () => {
    const result = transformVariant(makeVariant(), 987654321)
    expect(result.id).toBe('111222333')
    expect(result.productId).toBe('987654321')
  })

  it('builds title from option values', () => {
    const result = transformVariant(makeVariant(), 987654321)
    expect(result.title).toBe('Blue / L')
  })

  it('falls back to name when no option values', () => {
    const result = transformVariant(
      makeVariant({ optionValues: undefined }),
      987654321,
    )
    expect(result.title).toBe('Batik Silk Shirt - Blue / L')
  })

  it('maps price correctly', () => {
    const result = transformVariant(makeVariant(), 987654321)
    expect(result.price).toEqual({ amount: 350000, currency: 'IDR' })
  })

  it('maps SKU', () => {
    const result = transformVariant(makeVariant(), 987654321)
    expect(result.sku).toBe('BSS-BLUE-L')
  })

  it('builds option values map', () => {
    const result = transformVariant(makeVariant(), 987654321)
    expect(result.optionValues).toEqual({
      Color: 'Blue',
      Size: 'L',
    })
  })

  it('maps weight with GR to g', () => {
    const result = transformVariant(makeVariant(), 987654321)
    expect(result.weight).toBe(200)
    expect(result.weightUnit).toBe('g')
  })

  it('satisfies ProductVariantSchema', () => {
    const result = transformVariant(makeVariant(), 987654321)
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('handles missing option values gracefully', () => {
    const result = transformVariant(
      makeVariant({ optionValues: [] }),
      987654321,
    )
    expect(result.optionValues).toBeUndefined()
  })

  it('defaults to IDR currency', () => {
    const result = transformVariant(
      makeVariant({ priceCurrency: undefined }),
      987654321,
    )
    expect(result.price.currency).toBe('IDR')
  })
})
