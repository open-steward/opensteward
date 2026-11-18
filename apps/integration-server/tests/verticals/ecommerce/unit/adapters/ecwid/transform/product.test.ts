import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawEcwidProduct,
  type RawEcwidCombination,
} from '../../../../../../../src/verticals/ecommerce/adapters/ecwid/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeCombination(
  overrides: Partial<RawEcwidCombination> = {},
): RawEcwidCombination {
  return {
    id: 501,
    sku: 'TEE-S-BLUE',
    price: 24.99,
    defaultDisplayedPrice: 19.99,
    compareToPrice: 29.99,
    quantity: 17,
    weight: 180,
    options: [
      { name: 'Size', value: 'S' },
      { name: 'Color', value: 'Blue' },
    ],
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawEcwidProduct> = {}): RawEcwidProduct {
  return {
    id: 987654321,
    name: 'Ocean Blue T-Shirt',
    sku: 'ocean-blue-t-shirt',
    enabled: true,
    description: '<p>A comfy tee.</p>',
    price: 24.99,
    defaultDisplayedPrice: 19.99,
    compareToPrice: 29.99,
    options: [
      {
        name: 'Size',
        type: 'SELECT',
        choices: [
          { text: 'S', priceModifier: 0 },
          { text: 'M', priceModifier: 0 },
          { text: 'L', priceModifier: 0 },
        ],
      },
      {
        name: 'Color',
        type: 'SELECT',
        choices: [{ text: 'Blue', priceModifier: 0 }],
      },
    ],
    combinations: [makeCombination()],
    galleryImages: [
      {
        id: 900,
        imageUrl: 'https://cdn.example.com/img/001.jpg',
        alt: 'Front',
        orderBy: 0,
      },
    ],
    createTimestamp: 1704888000,
    updateTimestamp: 1706778000,
    ...overrides,
  }
}

describe('transformProduct (Ecwid)', () => {
  it('maps core fields and stringifies ids', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.id).toBe('987654321')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Ocean Blue T-Shirt')
    expect(result.handle).toBe('ocean-blue-t-shirt')
    expect(result.description).toBe('<p>A comfy tee.</p>')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps options from Ecwid choices', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]).toMatchObject({ name: 'Size', values: ['S', 'M', 'L'] })
    expect(result.options![1]).toMatchObject({ name: 'Color', values: ['Blue'] })
  })

  it('maps nested combinations with composite ids and option values', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('987654321:501')
    expect(v.productId).toBe('987654321')
    expect(v.sku).toBe('TEE-S-BLUE')
    expect(v.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(v.compareAtPrice).toEqual({ amount: 2999, currency: 'USD' })
    expect(v.optionValues).toEqual({ Size: 'S', Color: 'Blue' })
    expect((v.metadata as { parentProductId?: string }).parentProductId).toBe('987654321')
  })

  it('synthesises a default variant for simple products', () => {
    const simple = makeProduct({
      combinations: [],
      sku: 'SIMPLE-1',
      price: 9.99,
      defaultDisplayedPrice: 9.99,
      compareToPrice: 0,
    })
    const result = transformProduct(simple)
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('987654321:default')
    expect(v.sku).toBe('SIMPLE-1')
    expect(v.price).toEqual({ amount: 999, currency: 'USD' })
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
  })

  it('maps disabled products to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ enabled: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('converts timestamps to ISO dates', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBeDefined()
    expect(result.updatedAt).toBeDefined()
    // Verify they're valid ISO strings
    expect(() => new Date(result.createdAt!)).not.toThrow()
  })

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProduct({ combinations: [] }))
    const body = untransformProduct(canonical)
    expect(body['name']).toBe('Ocean Blue T-Shirt')
    expect(body['description']).toBe('<p>A comfy tee.</p>')
    expect(body['sku']).toBe('ocean-blue-t-shirt')
    expect(body['enabled']).toBe(true)
  })
})

describe('transformProductVariant (Ecwid) standalone', () => {
  it('builds a canonical variant from a raw combination', () => {
    const v = transformProductVariant(makeCombination(), '987654321')
    expect(v.id).toBe('987654321:501')
    expect(v.inventoryItemId).toBe('501')
    expect(v.weight).toBe(180)
    expect(v.weightUnit).toBe('g')
  })

  it('round-trips via untransformProductVariant', () => {
    const v = transformProductVariant(makeCombination(), '987654321')
    const body = untransformProductVariant(v)
    expect(body['sku']).toBe('TEE-S-BLUE')
    expect(body['price']).toBe(19.99)
    expect(body['options']).toEqual([
      { name: 'Size', value: 'S' },
      { name: 'Color', value: 'Blue' },
    ])
  })
})
