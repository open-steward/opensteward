import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawEbayInventoryItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/ebay/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawEbayInventoryItem> = {}): RawEbayInventoryItem {
  return {
    sku: 'WIDGET-001',
    locale: 'en_US',
    product: {
      title: 'Stainless Steel Widget',
      description: '<p>A premium stainless steel widget.</p>',
      brand: 'WidgetCo',
      mpn: 'WDG-001',
      ean: ['0123456789012'],
      imageUrls: [
        'https://i.ebayimg.com/images/g/aaa.jpg',
        'https://i.ebayimg.com/images/g/bbb.jpg',
      ],
      aspects: {
        Type: ['Widget'],
        Material: ['Stainless Steel'],
      },
    },
    condition: 'NEW',
    availability: {
      shipToLocationAvailability: {
        quantity: 50,
      },
    },
    ...overrides,
  }
}

describe('transformProduct (eBay)', () => {
  it('uses the SKU as the canonical id', () => {
    const result = transformProduct(makeItem())
    expect(result.id).toBe('WIDGET-001')
    expect(result.title).toBe('Stainless Steel Widget')
  })

  it('surfaces brand as vendor and condition via metadata', () => {
    const result = transformProduct(makeItem())
    expect(result.vendor).toBe('WidgetCo')
    expect(result.metadata['condition']).toBe('NEW')
  })

  it('maps items with title to ACTIVE and without to DRAFT', () => {
    expect(transformProduct(makeItem()).status).toBe('ACTIVE')
    const draft = transformProduct(
      makeItem({
        product: undefined,
      }),
    )
    expect(draft.status).toBe('DRAFT')
  })

  it('extracts image URLs into canonical images with positions', () => {
    const result = transformProduct(makeItem())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      url: 'https://i.ebayimg.com/images/g/aaa.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      url: 'https://i.ebayimg.com/images/g/bbb.jpg',
      position: 1,
    })
  })

  it('produces a payload that satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeItem()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['sku']).toBe('WIDGET-001')
  })

  it('round-trips title into an eBay product body via untransformProduct', () => {
    const canonical = transformProduct(makeItem())
    const body = untransformProduct(canonical)
    const product = body['product'] as Record<string, unknown>
    expect(product['title']).toBe('Stainless Steel Widget')
    expect(product['brand']).toBe('WidgetCo')
    expect(body['condition']).toBe('NEW')
  })
})
