import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawStripeProduct,
} from '../../../../../../../src/verticals/payments/adapters/yapily/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('yapily transformProduct (stripe-scaffold)', () => {
  it('maps a product with name and description', () => {
    const raw: RawStripeProduct = {
      id: 'prod-001',
      object: 'product',
      name: 'Acme Pro Plan',
      description: 'Professional subscription',
      active: true,
      created: 1709251200,
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('prod-001')
    expect(result.name).toBe('Acme Pro Plan')
    expect(result.description).toBe('Professional subscription')
    expect(result.active).toBe(true)
    expect(result.gateway).toBe('stripe')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps a product without optional fields', () => {
    const raw: RawStripeProduct = {
      id: 'prod-002',
      object: 'product',
      name: 'Basic Plan',
      created: 1709251200,
    }
    const result = transformProduct(raw)
    expect(result.name).toBe('Basic Plan')
    expect(result.description).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
