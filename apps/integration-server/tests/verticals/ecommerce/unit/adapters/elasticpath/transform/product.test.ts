import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  type RawEpProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/elasticpath/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawEpProduct> = {}): RawEpProduct {
  return {
    id: 'ep-prod-001',
    type: 'product',
    attributes: {
      name: 'Wireless Headphones',
      description: '<p>High-quality wireless headphones.</p>',
      slug: 'wireless-headphones',
      sku: 'WH-001',
      status: 'live',
      commodity_type: 'physical',
      created_at: '2024-06-01T10:00:00.000Z',
      updated_at: '2024-07-15T14:30:00.000Z',
    },
    relationships: {
      main_image: { data: { id: 'img-001', type: 'main_image' } },
      variations: {
        data: [
          { id: 'var-color', type: 'product-variation' },
          { id: 'var-size', type: 'product-variation' },
        ],
      },
    },
    ...overrides,
  }
}

function makeChild(overrides: Partial<RawEpProduct> = {}): RawEpProduct {
  return {
    id: 'ep-child-001',
    type: 'product',
    attributes: {
      name: 'Wireless Headphones - Black / Large',
      sku: 'WH-001-BLK-LG',
      status: 'live',
      commodity_type: 'physical',
    },
    ...overrides,
  }
}

describe('transformProduct (Elastic Path)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('ep-prod-001')
    expect(result.title).toBe('Wireless Headphones')
    expect(result.description).toBe('<p>High-quality wireless headphones.</p>')
    expect(result.handle).toBe('wireless-headphones')
    expect(result.status).toBe('ACTIVE')
    expect(result.productType).toBe('physical')
    expect(result.createdAt).toBe('2024-06-01T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-07-15T14:30:00.000Z')
  })

  it('maps children into variants', () => {
    const parent = makeProduct()
    const child = makeChild()
    const result = transformProduct(parent, [child])
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('ep-child-001')
    expect(v.productId).toBe('ep-prod-001')
    expect(v.sku).toBe('WH-001-BLK-LG')
    expect(v.price).toEqual({ amount: 0, currency: 'USD' })
  })

  it('synthesises a default variant when no children', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('ep-prod-001:default')
    expect(v.sku).toBe('WH-001')
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })

  it('maps draft status', () => {
    const result = transformProduct(
      makeProduct({ attributes: { ...makeProduct().attributes, status: 'draft' } }),
    )
    expect(result.status).toBe('DRAFT')
  })

  it('builds options from variations relationships', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]!.id).toBe('var-color')
  })

  it('maps main_image into images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.id).toBe('img-001')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct(), [makeChild()])
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProductVariant (Elastic Path) standalone', () => {
  it('builds a canonical variant from a child product', () => {
    const v = transformProductVariant(makeChild(), 'ep-prod-001')
    expect(v.id).toBe('ep-child-001')
    expect(v.productId).toBe('ep-prod-001')
    expect(v.sku).toBe('WH-001-BLK-LG')
    expect(v.price).toEqual({ amount: 0, currency: 'USD' })
    expect(v.taxable).toBe(true)
    expect(v.requiresShipping).toBe(true)
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })

  it('sets taxable=false for digital products', () => {
    const child = makeChild({
      attributes: { ...makeChild().attributes, commodity_type: 'digital' },
    })
    const v = transformProductVariant(child, 'ep-prod-001')
    expect(v.taxable).toBe(false)
    expect(v.requiresShipping).toBe(false)
  })
})

describe('untransformProduct (Elastic Path)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(body.data.type).toBe('product')
    expect(body.data.attributes['name']).toBe('Wireless Headphones')
    expect(body.data.attributes['status']).toBe('live')
    expect(body.data.attributes['slug']).toBe('wireless-headphones')
  })
})
