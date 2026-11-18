import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  mapListingState,
  etsyMoneyToDecimal,
  type RawEtsyListing,
} from '../../../../../../../src/verticals/ecommerce/adapters/etsy/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeListing(overrides: Partial<RawEtsyListing> = {}): RawEtsyListing {
  return {
    listing_id: 1234567890,
    title: 'Handmade Ceramic Mug',
    description: 'A beautiful handmade ceramic mug.',
    state: 'active',
    url: 'https://www.etsy.com/listing/1234567890/handmade-ceramic-mug',
    tags: ['ceramic', 'mug', 'handmade'],
    price: { amount: 2499, divisor: 100, currency_code: 'USD' },
    taxonomy_id: 1234,
    shop_section_id: 42,
    who_made: 'i_did',
    when_made: '2020_2024',
    is_supply: false,
    quantity: 10,
    views: 500,
    num_favorers: 25,
    images: [
      {
        listing_image_id: 111,
        listing_id: 1234567890,
        url_fullxfull: 'https://i.etsystatic.com/img/full1.jpg',
        url_570xN: 'https://i.etsystatic.com/img/570_1.jpg',
        full_width: 1500,
        full_height: 1200,
        rank: 0,
      },
      {
        listing_image_id: 222,
        listing_id: 1234567890,
        url_fullxfull: 'https://i.etsystatic.com/img/full2.jpg',
        url_570xN: 'https://i.etsystatic.com/img/570_2.jpg',
        full_width: 1500,
        full_height: 1200,
        rank: 1,
      },
    ],
    created_timestamp: 1704067200, // 2024-01-01T00:00:00Z
    updated_timestamp: 1706745600, // 2024-02-01T00:00:00Z
    ...overrides,
  }
}

describe('transformProduct (Etsy)', () => {
  it('uses the listing_id (stringified) as the canonical id', () => {
    const result = transformProduct(makeListing())
    expect(result.id).toBe('1234567890')
    expect(result.title).toBe('Handmade Ceramic Mug')
    expect(result.description).toBe('A beautiful handmade ceramic mug.')
  })

  it('maps listing state to canonical status', () => {
    expect(transformProduct(makeListing({ state: 'active' })).status).toBe('ACTIVE')
    expect(transformProduct(makeListing({ state: 'draft' })).status).toBe('DRAFT')
    expect(transformProduct(makeListing({ state: 'inactive' })).status).toBe('ARCHIVED')
    expect(transformProduct(makeListing({ state: 'expired' })).status).toBe('ARCHIVED')
    expect(transformProduct(makeListing({ state: 'sold_out' })).status).toBe('ARCHIVED')
  })

  it('maps images with positions from rank', () => {
    const result = transformProduct(makeListing())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      id: '111',
      url: 'https://i.etsystatic.com/img/full1.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      id: '222',
      url: 'https://i.etsystatic.com/img/full2.jpg',
      position: 1,
    })
  })

  it('surfaces tags and taxonomy as productType', () => {
    const result = transformProduct(makeListing())
    expect(result.tags).toEqual(['ceramic', 'mug', 'handmade'])
    expect(result.productType).toBe('1234')
  })

  it('converts timestamps to ISO strings', () => {
    const result = transformProduct(makeListing())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('produces a payload that satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeListing()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['listing_id']).toBe(1234567890)
  })

  it('round-trips title and tags into an Etsy body via untransformProduct', () => {
    const canonical = transformProduct(makeListing())
    const body = untransformProduct(canonical)
    expect(body['title']).toBe('Handmade Ceramic Mug')
    expect(body['tags']).toEqual(['ceramic', 'mug', 'handmade'])
    expect(body['description']).toBe('A beautiful handmade ceramic mug.')
  })
})

describe('mapListingState', () => {
  it('maps all known states correctly', () => {
    expect(mapListingState('active')).toBe('ACTIVE')
    expect(mapListingState('draft')).toBe('DRAFT')
    expect(mapListingState('edit')).toBe('DRAFT')
    expect(mapListingState('inactive')).toBe('ARCHIVED')
    expect(mapListingState('expired')).toBe('ARCHIVED')
    expect(mapListingState('sold_out')).toBe('ARCHIVED')
    expect(mapListingState('removed')).toBe('ARCHIVED')
    expect(mapListingState(undefined)).toBeUndefined()
    expect(mapListingState('unknown_state')).toBeUndefined()
  })
})

describe('etsyMoneyToDecimal', () => {
  it('converts Etsy money format to decimal', () => {
    expect(etsyMoneyToDecimal({ amount: 1999, divisor: 100, currency_code: 'USD' })).toBe(19.99)
    expect(etsyMoneyToDecimal({ amount: 500, divisor: 100, currency_code: 'EUR' })).toBe(5)
    expect(etsyMoneyToDecimal(undefined)).toBeUndefined()
  })

  it('handles zero divisor gracefully', () => {
    expect(etsyMoneyToDecimal({ amount: 100, divisor: 0, currency_code: 'USD' })).toBeUndefined()
  })
})
