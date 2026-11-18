import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawVendureProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/vendure/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawVendureProduct> = {}): RawVendureProduct {
  return {
    id: '1',
    name: 'Laptop Stand',
    description: '<p>Ergonomic aluminum laptop stand</p>',
    slug: 'laptop-stand',
    enabled: true,
    optionGroups: [
      {
        id: 'OG1',
        name: 'Color',
        code: 'color',
        options: [
          { id: 'O1', name: 'Silver', code: 'silver' },
          { id: 'O2', name: 'Space Grey', code: 'space-grey' },
        ],
      },
    ],
    variants: [
      {
        id: '10',
        name: 'Silver',
        sku: 'LS-SILVER',
        price: 4999, // $49.99 in cents
        currencyCode: 'USD',
        product: { id: '1' },
      },
    ],
    featuredAsset: { id: 'A1', preview: 'https://vendure.io/img/ls.jpg', name: 'Front' },
    assets: [
      { id: 'A1', preview: 'https://vendure.io/img/ls.jpg', name: 'Front' },
      { id: 'A2', preview: 'https://vendure.io/img/ls2.jpg', name: 'Side' },
    ],
    facetValues: [
      { id: 'FV1', name: 'electronics', code: 'electronics', facet: { id: 'F1', name: 'Category', code: 'category' } },
    ],
    createdAt: '2024-01-10T12:00:00Z',
    updatedAt: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (Vendure)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('1')
    expect(result.title).toBe('Laptop Stand')
    expect(result.handle).toBe('laptop-stand')
    expect(result.description).toBe('<p>Ergonomic aluminum laptop stand</p>')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps disabled product to DRAFT status', () => {
    const result = transformProduct(makeProduct({ enabled: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps variants with cents-to-dollars conversion', () => {
    const result = transformProduct(makeProduct())
    const variant = result.variants![0]!
    expect(variant.id).toBe('10')
    expect(variant.sku).toBe('LS-SILVER')
    expect(variant.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(variant.productId).toBe('1')
  })

  it('maps assets to images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]!.url).toBe('https://vendure.io/img/ls.jpg')
    expect(result.images![0]!.alt).toBe('Front')
  })

  it('maps option groups to options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toEqual(['Silver', 'Space Grey'])
  })

  it('maps facet values to tags', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['electronics'])
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
    const canonical = transformProduct(makeProduct())
    const raw = untransformProduct(canonical)
    expect(raw['name']).toBe('Laptop Stand')
    expect(raw['slug']).toBe('laptop-stand')
    expect(raw['enabled']).toBe(true)
  })
})
