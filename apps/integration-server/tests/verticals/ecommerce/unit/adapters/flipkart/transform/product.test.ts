import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawFlipkartListing,
} from '../../../../../../../src/verticals/ecommerce/adapters/flipkart/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeListing(overrides: Partial<RawFlipkartListing> = {}): RawFlipkartListing {
  return {
    listing_id: 'LSTSHRT001',
    sku_id: 'SKU-POLO-BLU-M',
    product_id: 'PRDSHRT001',
    title: 'Blue Polo T-Shirt - Medium',
    description: 'Premium cotton polo t-shirt in blue, size medium.',
    brand: 'FashionBrand',
    category: 'T-Shirts',
    mrp: 999,
    selling_price: 699,
    listing_status: 'ACTIVE',
    stock_count: 150,
    hsn: '61091000',
    images: [
      { url: 'https://rukminim1.flixcart.com/image/pol1.jpg' },
      { url: 'https://rukminim1.flixcart.com/image/pol2.jpg' },
    ],
    fulfillment_type: 'FLIPKART',
    created_at: '2024-03-15T10:00:00Z',
    updated_at: '2024-04-01T14:30:00Z',
    ...overrides,
  }
}

describe('transformProduct (Flipkart)', () => {
  it('uses listing_id as the canonical id', () => {
    const result = transformProduct(makeListing())
    expect(result.id).toBe('LSTSHRT001')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Blue Polo T-Shirt - Medium')
  })

  it('surfaces product_id, hsn, and fulfillmentType via metadata', () => {
    const result = transformProduct(makeListing())
    expect(result.metadata['productId']).toBe('PRDSHRT001')
    expect(result.metadata['hsn']).toBe('61091000')
    expect(result.metadata['fulfillmentType']).toBe('FLIPKART')
    expect(result.vendor).toBe('FashionBrand')
    expect(result.productType).toBe('T-Shirts')
  })

  it('maps ACTIVE status to ACTIVE and INACTIVE to ARCHIVED', () => {
    expect(transformProduct(makeListing()).status).toBe('ACTIVE')
    const archived = transformProduct(
      makeListing({ listing_status: 'INACTIVE' }),
    )
    expect(archived.status).toBe('ARCHIVED')
  })

  it('maps BLOCKED status to ARCHIVED', () => {
    const blocked = transformProduct(
      makeListing({ listing_status: 'BLOCKED' }),
    )
    expect(blocked.status).toBe('ARCHIVED')
  })

  it('maps DRAFT status to DRAFT', () => {
    const draft = transformProduct(
      makeListing({ listing_status: 'DRAFT' }),
    )
    expect(draft.status).toBe('DRAFT')
  })

  it('maps PENDING status to DRAFT', () => {
    const pending = transformProduct(
      makeListing({ listing_status: 'PENDING' }),
    )
    expect(pending.status).toBe('DRAFT')
  })

  it('maps images into canonical images with positions', () => {
    const result = transformProduct(makeListing())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      url: 'https://rukminim1.flixcart.com/image/pol1.jpg',
      position: 0,
    })
    expect(result.images![1]!.position).toBe(1)
  })

  it('returns undefined images when none provided', () => {
    const result = transformProduct(makeListing({ images: undefined }))
    expect(result.images).toBeUndefined()
  })

  it('produces a payload that satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeListing()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['listing_id']).toBe('LSTSHRT001')
  })

  it('maps description to the canonical description field', () => {
    const result = transformProduct(makeListing())
    expect(result.description).toBe('Premium cotton polo t-shirt in blue, size medium.')
  })

  it('falls back to sku_id for title when title is missing', () => {
    const result = transformProduct(makeListing({ title: undefined }))
    expect(result.title).toBe('SKU-POLO-BLU-M')
  })

  it('falls back to listing_id for title when both title and sku_id are missing', () => {
    const result = transformProduct(makeListing({ title: undefined, sku_id: undefined }))
    expect(result.title).toBe('LSTSHRT001')
  })

  it('round-trips title and brand into Flipkart body via untransformProduct', () => {
    const canonical = transformProduct(makeListing())
    const body = untransformProduct(canonical)
    expect(body['title']).toBe('Blue Polo T-Shirt - Medium')
    expect(body['brand']).toBe('FashionBrand')
    expect(body['category']).toBe('T-Shirts')
  })

  it('passes through MRP and selling price from metadata in untransformProduct', () => {
    const body = untransformProduct({
      title: 'Test',
      metadata: { mrp: 999, selling_price: 699 },
    })
    expect(body['mrp']).toBe(999)
    expect(body['selling_price']).toBe(699)
  })
})
