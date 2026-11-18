import { describe, it, expect } from 'vitest'
import {
  transformVariantLink,
  type RawOroVariantLink,
} from '../../../../../../../src/verticals/ecommerce/adapters/orocommerce/transform/variant'
import type { RawOroProduct } from '../../../../../../../src/verticals/ecommerce/adapters/orocommerce/transform/product'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeLink(overrides: Partial<RawOroVariantLink> = {}): RawOroVariantLink {
  return {
    id: 'link-1',
    parentProduct: { id: '42' },
    childProduct: { id: '43' },
    visible: true,
    _type: 'productvariantlinks',
    ...overrides,
  }
}

function makeChildProduct(overrides: Partial<RawOroProduct> = {}): RawOroProduct {
  return {
    id: '43',
    sku: 'WIDGET-A-RED',
    name: 'Widget A - Red',
    status: 'enabled',
    type: 'simple',
    prices: [{ price: 19.99, currency: 'USD' }],
    _type: 'products',
    ...overrides,
  }
}

describe('transformVariantLink (OroCommerce)', () => {
  it('transforms a variant link + child product into a canonical variant', () => {
    const result = transformVariantLink(makeLink(), makeChildProduct(), '42')
    expect(result.id).toBe('43')
    expect(result.productId).toBe('42')
    expect(result.sku).toBe('WIDGET-A-RED')
    expect(result.price).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('includes variantLinkId in metadata', () => {
    const result = transformVariantLink(makeLink(), makeChildProduct(), '42')
    expect((result.metadata as Record<string, unknown>)['variantLinkId']).toBe('link-1')
    expect((result.metadata as Record<string, unknown>)['parentProductId']).toBe('42')
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const result = transformVariantLink(makeLink(), makeChildProduct(), '42')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('handles missing prices gracefully', () => {
    const child = makeChildProduct({ prices: undefined })
    const result = transformVariantLink(makeLink(), child, '42')
    expect(result.price).toEqual({ amount: 0, currency: 'USD' })
  })
})
