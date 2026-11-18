import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawWebflowProduct,
  type RawWebflowSku,
} from '../../../../../../../src/verticals/ecommerce/adapters/webflow/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawWebflowProduct> = {}): RawWebflowProduct {
  return {
    id: 'prod_abc123',
    fieldData: {
      name: 'Designer Lamp',
      slug: 'designer-lamp',
      description: '<p>A beautiful lamp for your desk.</p>',
      'product-type': 'Home Decor',
      category: ['lamps', 'home'],
      'main-image': {
        url: 'https://cdn.webflow.com/img/lamp-main.jpg',
        alt: 'Lamp front view',
        fileId: 'img_001',
      },
      'more-images': [
        {
          url: 'https://cdn.webflow.com/img/lamp-side.jpg',
          alt: 'Side view',
          fileId: 'img_002',
        },
      ],
      'sku-properties': [
        {
          id: 'prop_color',
          name: 'Color',
          enum: [
            { id: 'enum_black', name: 'Black', slug: 'black' },
            { id: 'enum_white', name: 'White', slug: 'white' },
          ],
        },
      ],
    },
    skus: [
      {
        id: 'sku_001',
        fieldData: {
          name: 'Black',
          sku: 'LAMP-BLK',
          price: { value: 4999, unit: 'USD' },
          'compare-at-price': { value: 5999, unit: 'USD' },
          weight: 1200,
          'sku-values': { prop_color: 'enum_black' },
        },
      },
    ],
    createdOn: '2024-01-10T12:00:00Z',
    lastUpdated: '2024-02-01T09:00:00Z',
    lastPublished: '2024-01-11T00:00:00Z',
    isDraft: false,
    isArchived: false,
    ...overrides,
  }
}

describe('transformProduct', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod_abc123')
    expect(result.title).toBe('Designer Lamp')
    expect(result.handle).toBe('designer-lamp')
    expect(result.description).toBe('<p>A beautiful lamp for your desk.</p>')
    expect(result.productType).toBe('Home Decor')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps tags from category array', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['lamps', 'home'])
  })

  it('maps DRAFT status', () => {
    const result = transformProduct(makeProduct({ isDraft: true }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps ARCHIVED status', () => {
    const result = transformProduct(makeProduct({ isArchived: true }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps images with position', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]!.url).toBe('https://cdn.webflow.com/img/lamp-main.jpg')
    expect(result.images![0]!.position).toBe(0)
    expect(result.images![1]!.url).toBe('https://cdn.webflow.com/img/lamp-side.jpg')
    expect(result.images![1]!.position).toBe(1)
  })

  it('maps variants with option values', () => {
    const result = transformProduct(makeProduct())
    const variant = result.variants![0]!
    expect(variant.id).toBe('sku_001')
    expect(variant.sku).toBe('LAMP-BLK')
    expect(variant.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(variant.compareAtPrice).toEqual({ amount: 5999, currency: 'USD' })
    expect(variant.optionValues).toEqual({ Color: 'Black' })
  })

  it('converts cents to decimal in variant price', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants![0]!.price.amount).toBe(4999)
  })

  it('maps sku-properties to options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toEqual(['Black', 'White'])
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
    expect((raw.fieldData as Record<string, unknown>).name).toBe('Designer Lamp')
    expect((raw.fieldData as Record<string, unknown>).slug).toBe('designer-lamp')
    expect((raw.fieldData as Record<string, unknown>).description).toBe(
      '<p>A beautiful lamp for your desk.</p>',
    )
  })
})

describe('transformVariant', () => {
  it('maps standalone variant fields', () => {
    const raw: RawWebflowSku = {
      id: 'sku_002',
      fieldData: {
        name: 'White',
        sku: 'LAMP-WHT',
        price: { value: 4999, unit: 'USD' },
        weight: 1200,
      },
    }
    const result = transformVariant(raw, 'prod_abc123')
    expect(result.id).toBe('sku_002')
    expect(result.productId).toBe('prod_abc123')
    expect(result.sku).toBe('LAMP-WHT')
    expect(result.weight).toBe(1200)
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const raw: RawWebflowSku = {
      id: 'sku_003',
      fieldData: {
        name: 'Test',
        price: { value: 1000, unit: 'USD' },
      },
    }
    const result = transformVariant(raw, 'prod_test')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('round-trips price via untransformVariant', () => {
    const raw: RawWebflowSku = {
      id: 'sku_rt',
      fieldData: { price: { value: 2500, unit: 'EUR' } },
    }
    const canonical = transformVariant(raw)
    const out = untransformVariant(canonical)
    const fd = out.fieldData as Record<string, unknown>
    expect(fd.price).toEqual({ value: 2500, unit: 'EUR' })
  })
})
