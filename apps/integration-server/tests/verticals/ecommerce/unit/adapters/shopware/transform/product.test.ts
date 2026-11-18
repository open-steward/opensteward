import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawShopwareProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawShopwareProduct> = {}): RawShopwareProduct {
  return {
    id: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
    productNumber: 'SW-1001',
    name: 'Ocean Blue T-Shirt',
    description: '<p>A comfy tee from the Nordsee.</p>',
    active: true,
    price: [{ gross: 29.99, net: 25.20, linked: true }],
    stock: 50,
    availableStock: 45,
    weight: 180,
    ean: '4006381333931',
    manufacturer: { id: 'mfr-1', name: 'Nordwear' },
    cover: {
      id: 'cover-1',
      media: { url: 'https://cdn.example.com/tee-front.jpg', alt: 'Front' },
    },
    media: [
      {
        id: 'media-1',
        position: 0,
        media: { url: 'https://cdn.example.com/tee-front.jpg', alt: 'Front' },
      },
      {
        id: 'media-2',
        position: 1,
        media: { url: 'https://cdn.example.com/tee-back.jpg', alt: 'Back' },
      },
    ],
    categories: [{ id: 'cat-1', name: 'Shirts' }],
    tags: [{ id: 'tag-1', name: 'summer' }, { id: 'tag-2', name: 'blue' }],
    configuratorSettings: [
      {
        id: 'cs-1',
        optionId: 'opt-blue',
        option: { id: 'opt-blue', name: 'Blue', group: { id: 'grp-color', name: 'Color' } },
      },
      {
        id: 'cs-2',
        optionId: 'opt-red',
        option: { id: 'opt-red', name: 'Red', group: { id: 'grp-color', name: 'Color' } },
      },
      {
        id: 'cs-3',
        optionId: 'opt-s',
        option: { id: 'opt-s', name: 'S', group: { id: 'grp-size', name: 'Size' } },
      },
      {
        id: 'cs-4',
        optionId: 'opt-m',
        option: { id: 'opt-m', name: 'M', group: { id: 'grp-size', name: 'Size' } },
      },
    ],
    children: [
      {
        id: 'child-blue-s',
        parentId: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        productNumber: 'SW-1001.1',
        name: 'Ocean Blue T-Shirt - Blue / S',
        active: true,
        price: [{ gross: 29.99, net: 25.20, linked: true }],
        weight: 180,
        options: [
          { id: 'opt-blue', name: 'Blue', group: { id: 'grp-color', name: 'Color' } },
          { id: 'opt-s', name: 'S', group: { id: 'grp-size', name: 'Size' } },
        ],
      },
    ],
    createdAt: '2024-01-10T12:00:00+00:00',
    updatedAt: '2024-02-01T09:00:00+00:00',
    ...overrides,
  }
}

function makeSimpleProduct(overrides: Partial<RawShopwareProduct> = {}): RawShopwareProduct {
  return {
    id: 'simple-prod-1',
    productNumber: 'SW-SIMPLE-1',
    name: 'Simple Widget',
    active: true,
    price: [{ gross: 9.99, net: 8.40, linked: true }],
    stock: 100,
    createdAt: '2024-03-01T10:00:00+00:00',
    ...overrides,
  }
}

describe('transformProduct (Shopware)', () => {
  it('maps core fields for a configurable product', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')
    expect(result.title).toBe('Ocean Blue T-Shirt')
    expect(result.description).toBe('<p>A comfy tee from the Nordsee.</p>')
    expect(result.handle).toBe('sw-1001')
    expect(result.status).toBe('ACTIVE')
    expect(result.vendor).toBe('Nordwear')
  })

  it('maps images from media array', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/tee-front.jpg')
    expect(result.images![0]!.alt).toBe('Front')
    expect(result.images![1]!.url).toBe('https://cdn.example.com/tee-back.jpg')
  })

  it('uses cover image when no media array', () => {
    const result = transformProduct(makeProduct({ media: undefined }))
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/tee-front.jpg')
  })

  it('maps tags', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['summer', 'blue'])
  })

  it('builds configurator options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toContain('Blue')
    expect(result.options![0]!.values).toContain('Red')
    expect(result.options![1]!.name).toBe('Size')
    expect(result.options![1]!.values).toContain('S')
    expect(result.options![1]!.values).toContain('M')
  })

  it('maps child variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('child-blue-s')
    expect(v.productId).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')
    expect(v.sku).toBe('SW-1001.1')
    expect(v.price).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('synthesises a default variant for simple products', () => {
    const result = transformProduct(makeSimpleProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('simple-prod-1:default')
    expect(v.sku).toBe('SW-SIMPLE-1')
    expect(v.price).toEqual({ amount: 999, currency: 'EUR' })
    expect((v.metadata as Record<string, unknown>)['synthetic']).toBe(true)
  })

  it('maps DRAFT status for inactive products', () => {
    const result = transformProduct(makeProduct({ active: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('preserves raw payload in metadata and validates against ProductSchema', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('validates variants against ProductVariantSchema', () => {
    const result = transformProduct(makeProduct())
    for (const v of result.variants ?? []) {
      expect(() => ProductVariantSchema.parse(v)).not.toThrow()
    }
  })
})

describe('transformProductVariant (Shopware)', () => {
  it('maps option values from variant options', () => {
    const child: RawShopwareProduct = {
      id: 'child-blue-s',
      parentId: 'parent-1',
      productNumber: 'SW-1001.1',
      name: 'Blue / S',
      price: [{ gross: 29.99, net: 25.20 }],
      options: [
        { id: 'opt-blue', name: 'Blue', group: { id: 'grp-color', name: 'Color' } },
        { id: 'opt-s', name: 'S', group: { id: 'grp-size', name: 'Size' } },
      ],
    }
    const result = transformProductVariant(child, 'parent-1')
    expect(result.optionValues).toEqual({ Color: 'Blue', Size: 'S' })
  })

  it('sets weight and weightUnit when weight is present', () => {
    const child: RawShopwareProduct = {
      id: 'child-1',
      productNumber: 'SW-V1',
      name: 'Variant',
      price: [{ gross: 10 }],
      weight: 250,
    }
    const result = transformProductVariant(child, 'parent-1')
    expect(result.weight).toBe(250)
    expect(result.weightUnit).toBe('g')
  })

  it('maps barcode from ean', () => {
    const child: RawShopwareProduct = {
      id: 'child-1',
      productNumber: 'SW-V1',
      name: 'Variant',
      price: [{ gross: 10 }],
      ean: '1234567890123',
    }
    const result = transformProductVariant(child, 'parent-1')
    expect(result.barcode).toBe('1234567890123')
  })
})

describe('untransformProduct (Shopware)', () => {
  it('maps canonical fields back to Shopware shape', () => {
    const body = untransformProduct({
      title: 'New Product',
      handle: 'NP-001',
      description: 'A new product',
      status: 'ACTIVE',
      variants: [{ id: 'v1', price: { amount: 19.99, currency: 'EUR' }, weight: 200, metadata: {} }],
    })
    expect(body['name']).toBe('New Product')
    expect(body['productNumber']).toBe('NP-001')
    expect(body['active']).toBe(true)
    expect(body['weight']).toBe(200)
    const prices = body['price'] as Array<Record<string, unknown>>
    expect(prices[0]!['gross']).toBe(19.99)
  })

  it('maps DRAFT status to inactive', () => {
    const body = untransformProduct({ status: 'DRAFT' })
    expect(body['active']).toBe(false)
  })

  it('maps ARCHIVED status to inactive', () => {
    const body = untransformProduct({ status: 'ARCHIVED' })
    expect(body['active']).toBe(false)
  })
})

describe('untransformProductVariant (Shopware)', () => {
  it('maps variant fields', () => {
    const body = untransformProductVariant({
      sku: 'V-001',
      title: 'Blue / S',
      price: { amount: 24.99, currency: 'EUR' },
      weight: 180,
    })
    expect(body['productNumber']).toBe('V-001')
    expect(body['name']).toBe('Blue / S')
    const prices = body['price'] as Array<Record<string, unknown>>
    expect(prices[0]!['gross']).toBe(24.99)
    expect(body['weight']).toBe(180)
  })
})
