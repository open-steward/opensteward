import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawStripeProduct,
} from '../../../../../../../src/verticals/payments/adapters/payoneer/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('payoneer transformProduct', () => {
  it('maps a full product record', () => {
    const raw: RawStripeProduct = {
      id: 'prod_001',
      object: 'product',
      name: 'Pro Plan',
      description: 'Full-featured subscription',
      active: true,
      metadata: { tier: 'pro' },
      created: 1709251200,
    }

    const result = transformProduct(raw)

    expect(result.id).toBe('prod_001')
    expect(result.name).toBe('Pro Plan')
    expect(result.description).toBe('Full-featured subscription')
    expect(result.active).toBe(true)
    expect(result.gateway).toBe('stripe')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal product with no optional fields', () => {
    const raw: RawStripeProduct = {
      id: 'prod_002',
      object: 'product',
      name: 'Basic Plan',
      created: 1709251200,
    }

    const result = transformProduct(raw)

    expect(result.description).toBeUndefined()
    expect(result.active).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
