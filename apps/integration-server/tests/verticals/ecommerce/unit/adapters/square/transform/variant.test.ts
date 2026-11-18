import { describe, it, expect } from 'vitest'
import {
  transformVariant,
  type RawSquareItemVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/square/transform/variant'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariation(overrides: Partial<RawSquareItemVariation> = {}): RawSquareItemVariation {
  return {
    id: 'VAR_001',
    item_variation_data: {
      item_id: 'ITEM_ABC123',
      name: 'Small',
      sku: 'ESP-SM',
      upc: '111222333',
      pricing_type: 'FIXED_PRICING',
      price_money: { amount: 350, currency: 'USD' },
      ordinal: 1,
    },
    ...overrides,
  }
}

describe('transformVariant (Square)', () => {
  it('maps core fields and converts cents to decimal', () => {
    const result = transformVariant(makeVariation())
    expect(result.id).toBe('VAR_001')
    expect(result.productId).toBe('ITEM_ABC123')
    expect(result.sku).toBe('ESP-SM')
    expect(result.barcode).toBe('111222333')
    expect(result.title).toBe('Small')
    expect(result.price).toEqual({ amount: 350, currency: 'USD' })
    expect(result.position).toBe(1)
  })

  it('uses parentId fallback when item_id is missing', () => {
    const raw = makeVariation()
    delete raw.item_variation_data!.item_id
    const result = transformVariant(raw, 'PARENT_XYZ')
    expect(result.productId).toBe('PARENT_XYZ')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariation()
    const result = transformVariant(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const result = transformVariant(makeVariation())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('handles missing price_money gracefully', () => {
    const raw = makeVariation()
    delete raw.item_variation_data!.price_money
    const result = transformVariant(raw)
    expect(result.price).toEqual({ amount: 0, currency: 'USD' })
  })
})
