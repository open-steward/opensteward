import { describe, it, expect } from 'vitest'
import {
  transformItem,
  transformVariation,
  untransformItem,
  type RawPlentyOneItem,
  type RawPlentyOneVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/plentyone/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariation(overrides: Partial<RawPlentyOneVariation> = {}): RawPlentyOneVariation {
  return {
    id: 601,
    itemId: 100,
    isMain: true,
    isActive: true,
    number: 'SKU-LAPTOP-BLACK',
    barcode: '4006381333931',
    weightG: 1500,
    position: 0,
    variationSalesPrices: [{ salesPriceId: 1, price: 499.99, currency: 'EUR' }],
    variationAttributeValues: [
      {
        attributeId: 1,
        valueId: 10,
        attribute: { backendName: 'Color' },
        attributeValue: { backendName: 'Black' },
      },
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-03-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeItem(overrides: Partial<RawPlentyOneItem> = {}): RawPlentyOneItem {
  return {
    id: 100,
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-03-01T00:00:00.000Z',
    texts: [
      {
        lang: 'en',
        name1: 'Laptop Stand Pro',
        description: '<p>Adjustable aluminum laptop stand.</p>',
        urlPath: 'laptop-stand-pro',
      },
      {
        lang: 'de',
        name1: 'Laptop-Ständer Pro',
        description: '<p>Verstellbarer Aluminium-Laptopständer.</p>',
      },
    ],
    variations: [makeVariation()],
    itemImages: [
      {
        id: 900,
        url: 'https://cdn.plenty.com/img/laptop-stand.jpg',
        position: 1,
        names: [{ lang: 'en', name: 'Laptop Stand Front' }],
      },
    ],
    ...overrides,
  }
}

describe('plentyone transformItem', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformItem(makeItem())
    expect(result.id).toBe('100')
    expect(result.title).toBe('Laptop Stand Pro')
    expect(result.description).toBe('<p>Adjustable aluminum laptop stand.</p>')
    expect(result.handle).toBe('laptop-stand-pro')
    expect(result.status).toBe('ACTIVE')
  })

  it('prefers "en" locale text', () => {
    const result = transformItem(makeItem())
    expect(result.title).toBe('Laptop Stand Pro')
  })

  it('maps DRAFT status when isActive is false', () => {
    const result = transformItem(makeItem({ isActive: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('transforms variations into variants', () => {
    const result = transformItem(makeItem())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('601')
    expect(v.productId).toBe('100')
    expect(v.sku).toBe('SKU-LAPTOP-BLACK')
    expect(v.barcode).toBe('4006381333931')
    // 499.99 EUR = 49999 cents
    expect(v.price).toEqual({ amount: 49999, currency: 'EUR' })
    expect(v.weight).toBe(1500)
    expect(v.weightUnit).toBe('g')
  })

  it('builds optionValues from attribute values', () => {
    const result = transformItem(makeItem())
    expect(result.variants![0]!.optionValues).toEqual({ Color: 'Black' })
  })

  it('maps images', () => {
    const result = transformItem(makeItem())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.plenty.com/img/laptop-stand.jpg')
    expect(result.images![0]!.alt).toBe('Laptop Stand Front')
  })

  it('maps timestamps as ISO strings', () => {
    const result = transformItem(makeItem())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeItem()
    const result = transformItem(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformItem(makeItem())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformItem', () => {
    const canonical = transformItem(makeItem())
    const raw = untransformItem(canonical)
    expect(raw.isActive).toBe(true)
    const texts = raw.texts as Array<{ lang: string; name1: string }>
    expect(texts[0]!.lang).toBe('en')
    expect(texts[0]!.name1).toBe('Laptop Stand Pro')
  })
})

describe('plentyone transformVariation', () => {
  it('maps variation fields with EUR pricing', () => {
    const result = transformVariation(makeVariation())
    expect(result.id).toBe('601')
    expect(result.productId).toBe('100')
    expect(result.sku).toBe('SKU-LAPTOP-BLACK')
    expect(result.price).toEqual({ amount: 49999, currency: 'EUR' })
  })
})
