import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawDodoProduct,
} from '../../../../../../../src/verticals/payments/adapters/dodo-payments/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('dodo-payments transformProduct', () => {
  it('maps a full product record', () => {
    const raw: RawDodoProduct = {
      product_id: 'prod_001',
      business_id: 'biz_001',
      name: 'Pro Plan',
      description: 'Access to all pro features',
      price: 4999,
      currency: 'USD',
      tax_category: 'software',
      tax_inclusive: true,
      is_recurring: true,
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
      metadata: { sku: 'PRO-001' },
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('prod_001')
    expect(result.externalId).toBe('prod_001')
    expect(result.name).toBe('Pro Plan')
    expect(result.description).toBe('Access to all pro features')
    expect(result.active).toBe(true)
    expect(result.gateway).toBe('dodo-payments')
    expect(result.metadata).toMatchObject({ sku: 'PRO-001' })
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('defaults name to empty string when missing', () => {
    const raw: RawDodoProduct = {
      product_id: 'prod_002',
      name: null,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformProduct(raw)
    expect(result.name).toBe('')
    expect(result.active).toBe(true)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
