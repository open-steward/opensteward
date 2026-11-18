import { describe, it, expect } from 'vitest'
import {
  transformOffer,
  transformOfferVariant,
  type RawManomanoOffer,
} from '../../../../../../../src/verticals/ecommerce/adapters/manomano/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRaw(overrides: Partial<RawManomanoOffer> = {}): RawManomanoOffer {
  return {
    id_me: 'MM-MASTER-001',
    sku: 'SELLER-SKU-001',
    price: 29.99,
    stock: 10,
    title: 'Power Drill 18V',
    description: 'A powerful cordless drill.',
    ean: '3612345678901',
    category_id: 'cat-42',
    category_name: 'Power Tools',
    brand: 'ToolMaster',
    images: [{ url: 'https://cdn.example.com/drill.jpg', alt: 'Power Drill' }],
    is_sellable: true,
    currency: 'EUR',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOffer (ManoMano)', () => {
  it('maps id from id_me and title', () => {
    const result = transformOffer(makeRaw())
    expect(result.id).toBe('MM-MASTER-001')
    expect(result.title).toBe('Power Drill 18V')
  })

  it('maps vendor and productType from brand and category_name', () => {
    const result = transformOffer(makeRaw())
    expect(result.vendor).toBe('ToolMaster')
    expect(result.productType).toBe('Power Tools')
  })

  it('maps is_sellable=true to status ACTIVE', () => {
    const result = transformOffer(makeRaw({ is_sellable: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps is_sellable=false to status ARCHIVED', () => {
    const result = transformOffer(makeRaw({ is_sellable: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('leaves status undefined when is_sellable is absent', () => {
    const result = transformOffer(makeRaw({ is_sellable: undefined }))
    expect(result.status).toBeUndefined()
  })

  it('maps images with url and alt', () => {
    const result = transformOffer(makeRaw())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/drill.jpg')
    expect(result.images![0]!.alt).toBe('Power Drill')
  })

  it('embeds one variant with price in minor units', () => {
    const result = transformOffer(makeRaw())
    expect(result.variants).toHaveLength(1)
    // 29.99 EUR → 2999 cents
    expect(result.variants![0]!.price).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('maps datetime fields', () => {
    const result = transformOffer(makeRaw())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to sku as id when id_me is absent', () => {
    const result = transformOffer(makeRaw({ id_me: undefined }))
    expect(result.id).toBe('SELLER-SKU-001')
  })

  it('produces schema-valid output', () => {
    const result = transformOffer(makeRaw())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRaw()
    const result = transformOffer(raw)
    expect(result.metadata).toBe(raw)
  })
})

describe('transformOfferVariant (ManoMano)', () => {
  it('maps variant id, sku, and barcode', () => {
    const result = transformOfferVariant(makeRaw())
    expect(result.id).toBe('SELLER-SKU-001')
    expect(result.sku).toBe('SELLER-SKU-001')
    expect(result.barcode).toBe('3612345678901')
  })

  it('converts price from major to minor units', () => {
    const result = transformOfferVariant(makeRaw({ price: 9.5, currency: 'EUR' }))
    expect(result.price).toEqual({ amount: 950, currency: 'EUR' })
  })

  it('defaults price to 0 when price is null', () => {
    const result = transformOfferVariant(makeRaw({ price: null }))
    expect(result.price.amount).toBe(0)
  })

  it('defaults currency to EUR when absent', () => {
    const result = transformOfferVariant(makeRaw({ currency: undefined }))
    expect(result.price.currency).toBe('EUR')
  })

  it('produces schema-valid output', () => {
    const result = transformOfferVariant(makeRaw())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})
