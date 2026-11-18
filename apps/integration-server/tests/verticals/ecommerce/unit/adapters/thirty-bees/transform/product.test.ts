import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawThirtyBeesProduct,
  type RawThirtyBeesCombination,
} from '../../../../../../../src/verticals/ecommerce/adapters/thirty-bees/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeCombination(
  overrides: Partial<RawThirtyBeesCombination> = {},
): RawThirtyBeesCombination {
  return {
    id: 501,
    id_product: 42,
    reference: 'TEE-S-BLUE',
    price: '5.000000',
    weight: '0.180000',
    quantity: 17,
    default_on: '1',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawThirtyBeesProduct> = {}): RawThirtyBeesProduct {
  return {
    id: 42,
    name: 'Ocean Blue T-Shirt',
    link_rewrite: 'ocean-blue-t-shirt',
    description: '<p>A comfy tee.</p>',
    reference: 'TEE-BASE',
    price: '19.990000',
    active: 1,
    id_category_default: 3,
    date_add: '2024-01-10T12:00:00.000Z',
    date_upd: '2024-02-01T09:00:00.000Z',
    associations: {
      tags: [
        { id: 1, name: 'cotton' },
        { id: 2, name: 'summer' },
      ],
    },
    _combinations: [makeCombination()],
    _options: [
      { id: 1, name: 'Size', position: 0, values: ['S', 'M', 'L'] },
      { id: 2, name: 'Color', position: 1, values: ['Blue'] },
    ],
    ...overrides,
  }
}

describe('transformProduct (Thirty Bees)', () => {
  it('maps core fields and stringifies ids', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.id).toBe('42')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Ocean Blue T-Shirt')
    expect(result.handle).toBe('ocean-blue-t-shirt')
    expect(result.description).toBe('<p>A comfy tee.</p>')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps tags and options', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['cotton', 'summer'])
    expect(result.options).toHaveLength(2)
    expect(result.options![0]).toMatchObject({ name: 'Size', values: ['S', 'M', 'L'] })
  })

  it('maps nested combinations with composite ids and price delta', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('42:501')
    expect(v.productId).toBe('42')
    expect(v.sku).toBe('TEE-S-BLUE')
    // Price = base 19.99 + delta 5.00 = 24.99
    expect(v.price).toEqual({ amount: 2499, currency: 'EUR' })
  })

  it('synthesises a default variant for products without combinations', () => {
    const simple = makeProduct({
      reference: 'SIMPLE-1',
      price: '9.990000',
      _combinations: [],
    })
    const result = transformProduct(simple)
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('42:default')
    expect(v.sku).toBe('SIMPLE-1')
    expect(v.price).toEqual({ amount: 999, currency: 'EUR' })
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
  })

  it('maps inactive status to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ active: 0 }))
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

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProduct({ _combinations: [] }))
    const body = untransformProduct(canonical)
    expect(body['name']).toBe('Ocean Blue T-Shirt')
    expect(body['description']).toBe('<p>A comfy tee.</p>')
    expect(body['link_rewrite']).toBe('ocean-blue-t-shirt')
    expect(body['active']).toBe(1)
  })

  it('maps multi-lang name field (object form) to first value', () => {
    const result = transformProduct(makeProduct({ name: { '1': 'English Name', '2': 'French Name' } }))
    expect(result.title).toBe('English Name')
  })

  it('maps productType from id_category_default', () => {
    const result = transformProduct(makeProduct({ id_category_default: 7 }))
    expect(result.productType).toBe('7')
  })

  it('maps createdAt and updatedAt timestamps', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-10T12:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-01T09:00:00.000Z')
  })

  it('returns undefined productType when id_category_default is null', () => {
    const result = transformProduct(makeProduct({ id_category_default: null }))
    expect(result.productType).toBeUndefined()
  })

  it('maps zero-weight combination without weightUnit', () => {
    const result = transformProduct(makeProduct({
      _combinations: [makeCombination({ weight: null })],
    }))
    const v = result.variants![0]!
    expect(v.weight).toBeUndefined()
    expect(v.weightUnit).toBeUndefined()
  })
})

describe('transformProductVariant (Thirty Bees) standalone', () => {
  it('builds a canonical variant from a raw combination with price delta', () => {
    const v = transformProductVariant(makeCombination(), '42', 1999)
    expect(v.id).toBe('42:501')
    expect(v.inventoryItemId).toBe('501')
    expect(v.price).toEqual({ amount: 2499, currency: 'EUR' })
    expect(v.weight).toBe(0.18)
    expect(v.weightUnit).toBe('kg')
  })

  it('round-trips via untransformProductVariant', () => {
    const v = transformProductVariant(makeCombination(), '42', 1999)
    const body = untransformProductVariant(v)
    expect(body['reference']).toBe('TEE-S-BLUE')
  })
})
