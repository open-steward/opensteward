import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawInstamojoProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/instamojo/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawInstamojoProduct> = {}): RawInstamojoProduct {
  return {
    slug: 'blue-tshirt',
    title: 'Blue T-Shirt',
    description: 'A comfortable cotton t-shirt.',
    status: 'Live',
    user: 'https://api.instamojo.com/v2/users/user-001/',
    currency: 'INR',
    base_price: '499.00',
    product_type: 'physical',
    requires_shipping: true,
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (instamojo)', () => {
  it('uses slug as id and handle', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('blue-tshirt')
    expect(result.handle).toBe('blue-tshirt')
  })

  it('maps title', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('Blue T-Shirt')
  })

  it('maps description', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('A comfortable cotton t-shirt.')
  })

  it('maps Live → ACTIVE status', () => {
    const result = transformProduct(makeProduct())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Disabled → ARCHIVED status', () => {
    const result = transformProduct(makeProduct({ status: 'Disabled' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps Draft → DRAFT status', () => {
    const result = transformProduct(makeProduct({ status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps productType', () => {
    const result = transformProduct(makeProduct())
    expect(result.productType).toBe('physical')
  })

  it('maps vendor from user field', () => {
    const result = transformProduct(makeProduct())
    expect(result.vendor).toBe('https://api.instamojo.com/v2/users/user-001/')
  })

  it('creates a default variant with price in minor units', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('blue-tshirt-default')
    expect(v.productId).toBe('blue-tshirt')
    // 499.00 INR → 49900 minor units
    expect(v.price).toEqual({ amount: 49900, currency: 'INR' })
  })

  it('sets requiresShipping on default variant', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants![0]!.requiresShipping).toBe(true)
  })

  it('maps createdAt via toIsoDatetime', () => {
    // toIsoDatetime normalises to full ISO 8601 with milliseconds via Date.toISOString()
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults currency to INR when not provided', () => {
    const result = transformProduct(makeProduct({ currency: null }))
    expect(result.variants![0]!.price.currency).toBe('INR')
  })

  it('falls back to slug when title is null', () => {
    const result = transformProduct(makeProduct({ title: null }))
    expect(result.title).toBe('blue-tshirt')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
