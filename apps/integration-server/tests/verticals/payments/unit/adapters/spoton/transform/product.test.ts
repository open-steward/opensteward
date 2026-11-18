import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawStripeProduct,
} from '../../../../../../../src/verticals/payments/adapters/spoton/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('spoton transformProduct', () => {
  it('maps a full product', () => {
    const raw: RawStripeProduct = {
      id: 'prod_spoton_1',
      object: 'product',
      name: 'Pro Subscription',
      description: 'Access to all pro features',
      active: true,
      metadata: { sku: 'PRO-001' },
      created: 1709251200,
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('prod_spoton_1')
    expect(result.name).toBe('Pro Subscription')
    expect(result.description).toBe('Access to all pro features')
    expect(result.active).toBe(true)
    expect(result.gateway).toBe('stripe')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps a product with no description', () => {
    const raw: RawStripeProduct = {
      id: 'prod_spoton_2',
      object: 'product',
      name: 'Basic Plan',
      active: false,
      created: 1709251200,
    }
    const result = transformProduct(raw)
    expect(result.name).toBe('Basic Plan')
    expect(result.description).toBeUndefined()
    expect(result.active).toBe(false)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
