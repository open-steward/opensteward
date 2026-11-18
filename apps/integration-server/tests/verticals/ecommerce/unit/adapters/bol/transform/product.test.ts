import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawBolOffer,
} from '../../../../../../../src/verticals/ecommerce/adapters/bol/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeOffer(overrides: Partial<RawBolOffer> = {}): RawBolOffer {
  return {
    offerId: 'a]b]c-1234-offer',
    ean: '8712345678901',
    reference: 'WIDGET-NL-001',
    onHoldByRetailer: false,
    unknownProductTitle: 'Premium Dutch Widget',
    pricing: {
      bundlePrices: [
        { quantity: 1, unitPrice: 24.99 },
        { quantity: 6, unitPrice: 22.99 },
      ],
    },
    stock: {
      amount: 150,
      managedByRetailer: true,
    },
    fulfilment: {
      method: 'FBR',
      deliveryCode: '1-2d',
    },
    condition: {
      name: 'NEW',
      category: 'NEW',
    },
    ...overrides,
  }
}

describe('transformProduct (Bol.com)', () => {
  it('uses offerId as the canonical id', () => {
    const result = transformProduct(makeOffer())
    expect(result.id).toBe('a]b]c-1234-offer')
    expect(result.title).toBe('Premium Dutch Widget')
  })

  it('maps fulfilment method to productType', () => {
    expect(transformProduct(makeOffer()).productType).toBe('FBR')
    expect(
      transformProduct(makeOffer({ fulfilment: { method: 'FBB' } })).productType,
    ).toBe('FBB')
  })

  it('maps ACTIVE status for a normal offer', () => {
    expect(transformProduct(makeOffer()).status).toBe('ACTIVE')
  })

  it('maps ARCHIVED when onHoldByRetailer is true', () => {
    expect(
      transformProduct(makeOffer({ onHoldByRetailer: true })).status,
    ).toBe('ARCHIVED')
  })

  it('maps DRAFT when notPublishableReasons exist', () => {
    expect(
      transformProduct(
        makeOffer({
          notPublishableReasons: [{ code: 'UNKNOWN_EAN', description: 'Unknown EAN' }],
        }),
      ).status,
    ).toBe('DRAFT')
  })

  it('extracts unit price into a variant with EUR currency', () => {
    const result = transformProduct(makeOffer())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.price).toEqual({ amount: 2499, currency: 'EUR' })
    expect(result.variants![0]!.sku).toBe('WIDGET-NL-001')
    expect(result.variants![0]!.barcode).toBe('8712345678901')
  })

  it('falls back to title from reference when unknownProductTitle is absent', () => {
    const result = transformProduct(makeOffer({ unknownProductTitle: undefined }))
    expect(result.title).toBe('WIDGET-NL-001')
  })

  it('falls back to EAN when both title and reference are absent', () => {
    const result = transformProduct(
      makeOffer({ unknownProductTitle: undefined, reference: undefined }),
    )
    expect(result.title).toBe('8712345678901')
  })

  it('produces a payload that satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeOffer()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['offerId']).toBe('a]b]c-1234-offer')
  })

  it('round-trips core fields via untransformProduct', () => {
    const canonical = transformProduct(makeOffer())
    const body = untransformProduct(canonical)
    expect(body['ean']).toBe('8712345678901')
    expect(body['reference']).toBe('WIDGET-NL-001')
    expect(body['condition']).toEqual({ name: 'NEW' })
    const pricing = body['pricing'] as { bundlePrices: Array<{ quantity: number; unitPrice: number }> }
    expect(pricing.bundlePrices[0]!.unitPrice).toBe(24.99)
  })
})
