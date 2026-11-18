import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  type RawLsProduct,
  type RawLsProductAttributes,
  type RawLsVariant,
  type RawLsVariantAttributes,
} from '../../../../../../../src/verticals/ecommerce/adapters/lemon-squeezy/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProductAttrs(overrides: Partial<RawLsProductAttributes> = {}): RawLsProductAttributes {
  return {
    store_id: 1,
    name: 'Digital Toolkit',
    slug: 'digital-toolkit',
    description: '<p>Everything you need.</p>',
    status: 'published',
    large_thumb_url: 'https://cdn.lemonsqueezy.com/products/toolkit-large.jpg',
    thumb_url: 'https://cdn.lemonsqueezy.com/products/toolkit.jpg',
    price: 4999,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeProduct(attrsOverrides: Partial<RawLsProductAttributes> = {}): RawLsProduct {
  return {
    id: 'prod-55',
    type: 'products',
    attributes: makeProductAttrs(attrsOverrides),
  }
}

function makeVariantAttrs(overrides: Partial<RawLsVariantAttributes> = {}): RawLsVariantAttributes {
  return {
    product_id: 55,
    name: 'Pro Plan',
    slug: 'pro-plan',
    price: 4999,
    status: 'published',
    sort: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeVariant(attrsOverrides: Partial<RawLsVariantAttributes> = {}): RawLsVariant {
  return {
    id: 'var-88',
    type: 'variants',
    attributes: makeVariantAttrs(attrsOverrides),
  }
}

describe('transformProduct (lemon-squeezy)', () => {
  it('maps raw.id to id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod-55')
  })

  it('maps name to title', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('Digital Toolkit')
  })

  it('maps description', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('<p>Everything you need.</p>')
  })

  it('maps slug to handle', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('digital-toolkit')
  })

  it('maps published status to ACTIVE', () => {
    const result = transformProduct(makeProduct({ status: 'published' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformProduct(makeProduct({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('uses large_thumb_url as primary image', () => {
    const result = transformProduct(makeProduct())
    expect(result.images?.[0]?.url).toBe('https://cdn.lemonsqueezy.com/products/toolkit-large.jpg')
  })

  it('falls back to thumb_url when large_thumb_url is absent', () => {
    const result = transformProduct(makeProduct({ large_thumb_url: null }))
    expect(result.images?.[0]?.url).toBe('https://cdn.lemonsqueezy.com/products/toolkit.jpg')
  })

  it('sets images to empty when both thumb urls are absent', () => {
    const result = transformProduct(makeProduct({ large_thumb_url: null, thumb_url: null }))
    expect(result.images).toBeUndefined()
  })

  it('maps created_at to createdAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-01T00:00:00Z')
  })

  it('stores id and type in metadata', () => {
    const result = transformProduct(makeProduct())
    const meta = result.metadata as Record<string, unknown>
    expect(meta.id).toBe('prod-55')
    expect(meta.type).toBe('products')
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformVariant (lemon-squeezy)', () => {
  it('maps raw.id to id', () => {
    const result = transformVariant(makeVariant())
    expect(result.id).toBe('var-88')
  })

  it('maps product_id to productId', () => {
    const result = transformVariant(makeVariant())
    expect(result.productId).toBe('55')
  })

  it('maps name to title', () => {
    const result = transformVariant(makeVariant())
    expect(result.title).toBe('Pro Plan')
  })

  it('maps price cents directly to minor units', () => {
    // 4999 cents → already minor units
    const result = transformVariant(makeVariant({ price: 4999 }))
    expect(result.price.amount).toBe(4999)
    expect(result.price.currency).toBe('USD')
  })

  it('maps sort to position', () => {
    const result = transformVariant(makeVariant({ sort: 3 }))
    expect(result.position).toBe(3)
  })

  it('keeps created_at in metadata (the canonical variant has no createdAt)', () => {
    const result = transformVariant(makeVariant())
    expect(result.metadata).toMatchObject({ created_at: '2024-01-01T00:00:00Z' })
  })

  it('stores id and type in metadata', () => {
    const result = transformVariant(makeVariant())
    const meta = result.metadata as Record<string, unknown>
    expect(meta.id).toBe('var-88')
    expect(meta.type).toBe('variants')
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    const result = transformVariant(makeVariant())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})
