import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawRechargeProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/recharge/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawRechargeProduct> = {}): RawRechargeProduct {
  return {
    id: 42,
    external_product_id: 'shopify-123',
    title: 'Coffee Beans',
    handle: 'coffee-beans',
    status: 'active',
    images: {
      original: 'https://cdn.recharge.com/coffee-beans-original.jpg',
      large: 'https://cdn.recharge.com/coffee-beans-large.jpg',
    },
    subscription_defaults: {
      order_interval_frequency: 4,
      order_interval_unit: 'week',
    },
    variants: [
      {
        id: 101,
        external_variant_id: 'shopify-var-1',
        sku: 'COFFEE-250G',
        title: '250g',
        price: '12.99',
      },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformProduct', () => {
  it('maps id, title, handle, status', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('42')
    expect(result.title).toBe('Coffee Beans')
    expect(result.handle).toBe('coffee-beans')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive status to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ status: 'inactive' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformProduct(makeProduct({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps variants with price conversion', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const variant = result.variants![0]!
    expect(variant.id).toBe('101')
    expect(variant.sku).toBe('COFFEE-250G')
    expect(variant.price).toEqual({ amount: 1299, currency: 'USD' })
    expect(variant.productId).toBe('42')
  })

  it('synthesises a default variant when variants is empty', () => {
    const result = transformProduct(makeProduct({ variants: [] }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('42:default')
  })

  it('prefers original image url', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.recharge.com/coffee-beans-original.jpg')
  })

  it('falls back to large image when no original', () => {
    const result = transformProduct(
      makeProduct({ images: { large: 'https://cdn.recharge.com/large.jpg' } }),
    )
    expect(result.images![0]!.url).toBe('https://cdn.recharge.com/large.jpg')
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
    expect(raw.title).toBe('Coffee Beans')
    expect(raw.handle).toBe('coffee-beans')
    expect(raw.status).toBe('active')
  })
})
