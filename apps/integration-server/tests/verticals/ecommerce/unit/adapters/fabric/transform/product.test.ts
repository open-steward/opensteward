import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawFabricProduct,
  type RawFabricVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/fabric/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawFabricVariant> = {}): RawFabricVariant {
  return {
    id: 'var-001',
    sku: 'FB-SKU-001',
    title: 'Black / Large',
    price: 49.99,
    compare_at_price: 59.99,
    currency: 'USD',
    weight: 250,
    weight_unit: 'g',
    barcode: '1234567890',
    position: 1,
    option_values: { color: 'Black', size: 'Large' },
    taxable: true,
    requires_shipping: true,
    inventory_item_id: 'inv-001',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawFabricProduct> = {}): RawFabricProduct {
  return {
    id: 'prod-001',
    name: 'Wireless Headphones',
    description: '<p>Premium wireless headphones.</p>',
    slug: 'wireless-headphones',
    status: 'active',
    vendor: 'AudioCo',
    product_type: 'Electronics',
    tags: ['audio', 'wireless'],
    sku: 'WH-001',
    options: [
      { id: 'opt-color', name: 'Color', values: ['Black', 'White'], position: 0 },
      { id: 'opt-size', name: 'Size', values: ['Small', 'Large'], position: 1 },
    ],
    variants: [makeVariant()],
    images: [
      { id: 'img-001', url: 'https://cdn.fabric.inc/img1.jpg', alt_text: 'Front view', width: 800, height: 600, position: 0 },
    ],
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-06-20T14:30:00Z',
    published_at: '2024-01-16T08:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (fabric)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod-001')
    expect(result.title).toBe('Wireless Headphones')
    expect(result.description).toBe('<p>Premium wireless headphones.</p>')
    expect(result.handle).toBe('wireless-headphones')
    expect(result.status).toBe('ACTIVE')
    expect(result.vendor).toBe('AudioCo')
    expect(result.productType).toBe('Electronics')
    expect(result.tags).toEqual(['audio', 'wireless'])
    expect(result.createdAt).toBe('2024-01-15T10:00:00Z')
    expect(result.updatedAt).toBe('2024-06-20T14:30:00Z')
    expect(result.publishedAt).toBe('2024-01-16T08:00:00Z')
  })

  it('maps variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('var-001')
    expect(v.productId).toBe('prod-001')
    expect(v.sku).toBe('FB-SKU-001')
    expect(v.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(v.compareAtPrice).toEqual({ amount: 5999, currency: 'USD' })
  })

  it('maps options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toEqual(['Black', 'White'])
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.fabric.inc/img1.jpg')
    expect(result.images![0]!.alt).toBe('Front view')
  })

  it('synthesises a default variant when no variants provided', () => {
    const result = transformProduct(makeProduct({ variants: [] }))
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('prod-001:default')
    expect(v.sku).toBe('WH-001')
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
  })

  it('maps draft status', () => {
    const result = transformProduct(makeProduct({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps archived status', () => {
    const result = transformProduct(makeProduct({ status: 'archived' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformVariant (fabric)', () => {
  it('builds a canonical variant', () => {
    const v = transformVariant(makeVariant(), 'prod-001')
    expect(v.id).toBe('var-001')
    expect(v.productId).toBe('prod-001')
    expect(v.sku).toBe('FB-SKU-001')
    expect(v.barcode).toBe('1234567890')
    expect(v.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(v.weight).toBe(250)
    expect(v.weightUnit).toBe('g')
    expect(v.optionValues).toEqual({ color: 'Black', size: 'Large' })
    expect(v.taxable).toBe(true)
    expect(v.requiresShipping).toBe(true)
    expect(v.inventoryItemId).toBe('inv-001')
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })

  it('defaults price to 0/USD when missing', () => {
    const v = transformVariant(makeVariant({ price: undefined, currency: undefined }), 'prod-001')
    expect(v.price).toEqual({ amount: 0, currency: 'USD' })
  })
})

describe('untransformProduct (fabric)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical) as Record<string, unknown>
    expect(body['name']).toBe('Wireless Headphones')
    expect(body['slug']).toBe('wireless-headphones')
    expect(body['status']).toBe('active')
    expect(body['vendor']).toBe('AudioCo')
    expect(body['product_type']).toBe('Electronics')
    expect(body['tags']).toEqual(['audio', 'wireless'])
  })

  it('maps ARCHIVED status', () => {
    const body = untransformProduct({ status: 'ARCHIVED' }) as Record<string, unknown>
    expect(body['status']).toBe('archived')
  })
})
