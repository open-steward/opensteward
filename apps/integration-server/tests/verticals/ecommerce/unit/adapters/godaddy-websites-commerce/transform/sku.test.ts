import { describe, it, expect } from 'vitest'
import {
  transformSku,
  type RawGoDaddySku,
} from '../../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/transform/sku'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

/**
 * Fields from the `SKU` reference
 * (https://developer.godaddy.com/docs/references/rest/catalog/sku/queries/sku);
 * price values are "Integer minor units ... `1999` = $19.99".
 */
function makeSku(overrides: Partial<RawGoDaddySku> = {}): RawGoDaddySku {
  return {
    id: 'SKU_ID',
    code: 'TSHIRT-BLUE-M',
    name: 'tshirt-blue-m',
    label: 'T-shirt, blue, M',
    status: 'ACTIVE',
    weight: 0.2,
    unitOfWeight: 'KG',
    disableShipping: false,
    createdAt: '2026-08-27T10:00:00.000Z',
    updatedAt: '2026-08-28T11:30:00.000Z',
    skuGroup: { id: 'SKU_GROUP_ID' },
    prices: {
      edges: [
        {
          node: {
            value: { value: 1999, currencyCode: 'USD' },
            compareAtValue: { value: 2499, currencyCode: 'USD' },
          },
        },
      ],
    },
    ...overrides,
  }
}

describe('transformSku (GoDaddy SKU → ProductVariant)', () => {
  it('parses against the canonical ProductVariantSchema', () => {
    expect(() => ProductVariantSchema.parse(transformSku(makeSku()))).not.toThrow()
  })

  it('maps the documented fields; minor-unit prices pass through unscaled', () => {
    const v = transformSku(makeSku())
    expect(v.id).toBe('SKU_ID')
    expect(v.productId).toBe('SKU_GROUP_ID')
    expect(v.sku).toBe('TSHIRT-BLUE-M')
    expect(v.title).toBe('T-shirt, blue, M')
    expect(v.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(v.compareAtPrice).toEqual({ amount: 2499, currency: 'USD' })
    expect(v.weight).toBe(0.2)
    expect(v.weightUnit).toBe('kg')
    expect(v.requiresShipping).toBe(true)
  })

  it('maps GR to grams and disableShipping to requiresShipping false', () => {
    const v = transformSku(makeSku({ unitOfWeight: 'GR', weight: 200, disableShipping: true }))
    expect(v.weightUnit).toBe('g')
    expect(v.requiresShipping).toBe(false)
  })

  it('throws when the SKU has no price (no documented source for the required price)', () => {
    expect(() => transformSku(makeSku({ prices: { edges: [] } }))).toThrow(/has 0 prices/)
  })

  it('throws rather than choose among several prices', () => {
    const node = { value: { value: 1999, currencyCode: 'USD' } }
    const eur = { value: { value: 1899, currencyCode: 'EUR' } }
    expect(() => transformSku(makeSku({ prices: { edges: [{ node }, { node: eur }] } }))).toThrow(
      /has 2 prices/,
    )
  })

  it('omits compareAtPrice when the price has none', () => {
    const v = transformSku(
      makeSku({ prices: { edges: [{ node: { value: { value: 500, currencyCode: 'GBP' } } }] } }),
    )
    expect(v.compareAtPrice).toBeUndefined()
    expect(v.price).toEqual({ amount: 500, currency: 'GBP' })
  })
})
