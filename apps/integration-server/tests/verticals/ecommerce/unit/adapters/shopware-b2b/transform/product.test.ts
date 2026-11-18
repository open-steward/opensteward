import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawShopwareProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware-b2b/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawShopwareProduct> = {}): RawShopwareProduct {
  return {
    id: 'b2b-prod-001',
    productNumber: 'B2B-SW-1001',
    name: 'Industrial Safety Helmet',
    description: '<p>EN 397 certified safety helmet for B2B orders.</p>',
    active: true,
    price: [{ gross: 42.50, net: 35.71, linked: true }],
    stock: 200,
    availableStock: 180,
    weight: 350,
    ean: '4006381333931',
    manufacturer: { id: 'mfr-1', name: 'SafetyFirst GmbH' },
    cover: {
      id: 'cover-1',
      media: { url: 'https://cdn.example.com/helmet-front.jpg', alt: 'Front' },
    },
    media: [
      {
        id: 'media-1',
        position: 0,
        media: { url: 'https://cdn.example.com/helmet-front.jpg', alt: 'Front' },
      },
    ],
    categories: [{ id: 'cat-1', name: 'Safety Equipment' }],
    tags: [{ id: 'tag-1', name: 'safety' }, { id: 'tag-2', name: 'b2b' }],
    configuratorSettings: [
      {
        id: 'cs-1',
        optionId: 'opt-white',
        option: { id: 'opt-white', name: 'White', group: { id: 'grp-color', name: 'Color' } },
      },
      {
        id: 'cs-2',
        optionId: 'opt-yellow',
        option: { id: 'opt-yellow', name: 'Yellow', group: { id: 'grp-color', name: 'Color' } },
      },
    ],
    children: [
      {
        id: 'child-white',
        parentId: 'b2b-prod-001',
        productNumber: 'B2B-SW-1001.W',
        name: 'Safety Helmet - White',
        active: true,
        price: [{ gross: 42.50, net: 35.71, linked: true }],
        weight: 350,
        options: [
          { id: 'opt-white', name: 'White', group: { id: 'grp-color', name: 'Color' } },
        ],
      },
    ],
    createdAt: '2024-01-10T12:00:00+00:00',
    updatedAt: '2024-02-01T09:00:00+00:00',
    ...overrides,
  }
}

describe('transformProduct (Shopware B2B)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('b2b-prod-001')
    expect(result.title).toBe('Industrial Safety Helmet')
    expect(result.handle).toBe('b2b-sw-1001')
    expect(result.status).toBe('ACTIVE')
    expect(result.vendor).toBe('SafetyFirst GmbH')
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/helmet-front.jpg')
  })

  it('maps tags', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['safety', 'b2b'])
  })

  it('maps child variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('child-white')
    expect(v.productId).toBe('b2b-prod-001')
    expect(v.sku).toBe('B2B-SW-1001.W')
  })

  it('synthesises default variant for simple products', () => {
    const result = transformProduct(makeProduct({ children: undefined }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('b2b-prod-001:default')
  })

  it('maps DRAFT for inactive', () => {
    const result = transformProduct(makeProduct({ active: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('preserves metadata and validates', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('validates variants', () => {
    const result = transformProduct(makeProduct())
    for (const v of result.variants ?? []) {
      expect(() => ProductVariantSchema.parse(v)).not.toThrow()
    }
  })
})

describe('transformProductVariant (Shopware B2B)', () => {
  it('maps option values', () => {
    const child: RawShopwareProduct = {
      id: 'child-white',
      parentId: 'parent-1',
      productNumber: 'B2B-V1',
      name: 'White',
      price: [{ gross: 42.50 }],
      options: [
        { id: 'opt-white', name: 'White', group: { id: 'grp-color', name: 'Color' } },
      ],
    }
    const result = transformProductVariant(child, 'parent-1')
    expect(result.optionValues).toEqual({ Color: 'White' })
  })
})

describe('untransformProduct (Shopware B2B)', () => {
  it('maps canonical to Shopware shape', () => {
    const body = untransformProduct({
      title: 'New B2B Product',
      handle: 'B2B-NP-001',
      status: 'ACTIVE',
      variants: [{ id: 'v1', price: { amount: 99.99, currency: 'EUR' }, metadata: {} }],
    })
    expect(body['name']).toBe('New B2B Product')
    expect(body['productNumber']).toBe('B2B-NP-001')
    expect(body['active']).toBe(true)
  })
})

describe('untransformProductVariant (Shopware B2B)', () => {
  it('maps variant fields', () => {
    const body = untransformProductVariant({
      sku: 'B2B-V-001',
      title: 'White',
      price: { amount: 42.50, currency: 'EUR' },
    })
    expect(body['productNumber']).toBe('B2B-V-001')
    expect(body['name']).toBe('White')
  })
})
