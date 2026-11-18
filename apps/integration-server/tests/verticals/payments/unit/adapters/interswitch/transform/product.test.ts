import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawStripeProduct,
} from '../../../../../../../src/verticals/payments/adapters/interswitch/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('interswitch transformProduct', () => {
  it('maps a product with all fields', () => {
    const raw: RawStripeProduct = {
      id: 'prod-001',
      object: 'product',
      name: 'Pro Subscription',
      description: 'Access to pro features',
      active: true,
      created: 1709251200,
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('prod-001')
    expect(result.name).toBe('Pro Subscription')
    expect(result.description).toBe('Access to pro features')
    expect(result.active).toBe(true)
    expect(result.gateway).toBe('stripe')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields', () => {
    const raw: RawStripeProduct = {
      id: 'prod-002',
      object: 'product',
      name: 'Basic Plan',
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('prod-002')
    expect(result.description).toBeUndefined()
    expect(result.active).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
