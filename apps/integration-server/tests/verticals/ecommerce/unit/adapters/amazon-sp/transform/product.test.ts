import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawAmazonListingsItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/amazon-sp/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawAmazonListingsItem> = {}): RawAmazonListingsItem {
  return {
    sku: 'TEE-S-BLUE',
    summaries: [
      {
        marketplaceId: 'ATVPDKIKX0DER',
        asin: 'B0ABCDE123',
        productType: 'SHIRT',
        conditionType: 'new_new',
        status: ['BUYABLE'],
        itemName: 'Ocean Blue T-Shirt',
        createdDate: '2024-01-10T12:00:00Z',
        lastUpdatedDate: '2024-02-01T09:00:00Z',
        mainImage: {
          link: 'https://m.media-amazon.com/images/I/71ABC.jpg',
          width: 1500,
          height: 1500,
        },
        brand: 'AcmeApparel',
        manufacturer: 'Acme Inc',
      },
    ],
    attributes: {
      item_name: [{ value: 'Ocean Blue T-Shirt', marketplace_id: 'ATVPDKIKX0DER' }],
    },
    images: [
      {
        marketplaceId: 'ATVPDKIKX0DER',
        images: [
          { link: 'https://m.media-amazon.com/images/I/71ABC.jpg', width: 1500, height: 1500 },
          { link: 'https://m.media-amazon.com/images/I/71XYZ.jpg', width: 1500, height: 1500 },
        ],
      },
    ],
    ...overrides,
  }
}

describe('transformProduct (AmazonSP)', () => {
  it('uses the SKU as the canonical id', () => {
    const result = transformProduct(makeItem())
    expect(result.id).toBe('TEE-S-BLUE')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Ocean Blue T-Shirt')
  })

  it('surfaces the ASIN and productType via metadata', () => {
    const result = transformProduct(makeItem())
    expect(result.metadata['asin']).toBe('B0ABCDE123')
    expect(result.metadata['productType']).toBe('SHIRT')
    expect(result.productType).toBe('SHIRT')
    expect(result.vendor).toBe('AcmeApparel')
  })

  it('maps BUYABLE status to ACTIVE and INCOMPLETE_* to DRAFT', () => {
    expect(transformProduct(makeItem()).status).toBe('ACTIVE')
    const draft = transformProduct(
      makeItem({
        summaries: [
          {
            status: ['INCOMPLETE_LISTING'],
            itemName: 'Unfinished',
          },
        ],
      }),
    )
    expect(draft.status).toBe('DRAFT')
  })

  it('maps the multi-image bundle into canonical images with positions', () => {
    const result = transformProduct(makeItem())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      url: 'https://m.media-amazon.com/images/I/71ABC.jpg',
      position: 0,
    })
  })

  it('produces a payload that satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeItem()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    // metadata is a copy with extras (asin/productType) so assert fields
    // from the raw payload round-trip instead of strict identity.
    expect(result.metadata['sku']).toBe('TEE-S-BLUE')
  })

  it('round-trips title into an Amazon attributes bag via untransformProduct', () => {
    const canonical = transformProduct(makeItem())
    const body = untransformProduct(canonical)
    expect(body['productType']).toBe('SHIRT')
    expect(body['requirements']).toBe('LISTING')
    const attrs = body['attributes'] as Record<string, unknown>
    expect(attrs['item_name']).toBeDefined()
  })
})
