import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  lsDecimalToNumber,
  type RawLightspeedItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/lightspeed-retail/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawLightspeedItem> = {}): RawLightspeedItem {
  return {
    itemID: '501',
    systemSku: 'SYS-501',
    customSku: 'COFFEE-001',
    description: 'House Blend Coffee',
    modelYear: 'Medium roast single-origin',
    itemType: 'default',
    upc: '012345678901',
    ean: '',
    archived: 'false',
    defaultCost: '8.50',
    qoh: '42',
    categoryID: '10',
    createTime: '2024-01-10T12:00:00+00:00',
    timeStamp: '2024-03-15T09:00:00+00:00',
    Prices: {
      ItemPrice: [
        { amount: '14.99', useType: 'Default' },
        { amount: '12.99', useType: 'MSRP' },
      ],
    },
    Images: {
      Image: { imageID: 'IMG_1', src: 'https://cdn.ls.com/img1.jpg', alt: 'Coffee bag' },
    },
    ...overrides,
  }
}

describe('lsDecimalToNumber', () => {
  it('parses decimal strings', () => {
    expect(lsDecimalToNumber('19.99')).toBe(19.99)
  })

  it('returns 0 for undefined', () => {
    expect(lsDecimalToNumber(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(lsDecimalToNumber('')).toBe(0)
  })

  it('returns 0 for non-numeric string', () => {
    expect(lsDecimalToNumber('abc')).toBe(0)
  })
})

describe('transformProduct (Lightspeed Retail)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeItem())
    expect(result.id).toBe('501')
    expect(result.title).toBe('House Blend Coffee')
    expect(result.description).toBe('Medium roast single-origin')
    expect(result.status).toBe('ACTIVE')
    expect(result.productType).toBe('default')
  })

  it('maps default variant with pricing from decimal string', () => {
    const result = transformProduct(makeItem())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('501')
    expect(v.sku).toBe('COFFEE-001')
    expect(v.barcode).toBe('012345678901')
    expect(v.price).toEqual({ amount: 1499, currency: 'USD' })
  })

  it('maps images', () => {
    const result = transformProduct(makeItem())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.ls.com/img1.jpg')
    expect(result.images![0]!.alt).toBe('Coffee bag')
  })

  it('handles multiple images as array', () => {
    const result = transformProduct(
      makeItem({
        Images: {
          Image: [
            { imageID: 'IMG_1', src: 'https://cdn.ls.com/img1.jpg' },
            { imageID: 'IMG_2', src: 'https://cdn.ls.com/img2.jpg' },
          ],
        },
      }),
    )
    expect(result.images).toHaveLength(2)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeItem()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeItem())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('marks archived items as ARCHIVED', () => {
    const result = transformProduct(makeItem({ archived: 'true' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('falls back to defaultCost when no ItemPrice exists', () => {
    const result = transformProduct(makeItem({ Prices: undefined }))
    const v = result.variants![0]!
    expect(v.price.amount).toBe(850)
  })

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeItem())
    const raw = untransformProduct(canonical)
    expect(raw['description']).toBe('House Blend Coffee')
  })
})
