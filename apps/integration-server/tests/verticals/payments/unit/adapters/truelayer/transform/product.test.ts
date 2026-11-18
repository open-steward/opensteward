import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawStripeProduct,
} from '../../../../../../../src/verticals/payments/adapters/truelayer/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('truelayer transformProduct', () => {
  it('maps a product with name and description', () => {
    const raw: RawStripeProduct = {
      id: 'prod_tl_001',
      object: 'product',
      name: 'Pro Plan',
      description: 'Access to all pro features',
      active: true,
      created: 1709251200,
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('prod_tl_001')
    expect(result.name).toBe('Pro Plan')
    expect(result.description).toBe('Access to all pro features')
    expect(result.active).toBe(true)
    expect(result.gateway).toBe('stripe')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal product with only a name', () => {
    const raw: RawStripeProduct = {
      id: 'prod_tl_002',
      object: 'product',
      name: 'Basic Plan',
    }
    const result = transformProduct(raw)
    expect(result.name).toBe('Basic Plan')
    expect(result.description).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
