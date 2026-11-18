import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawStripeProduct,
} from '../../../../../../../src/verticals/payments/adapters/bridge-open-banking/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('bridge-open-banking transformProduct', () => {
  it('maps a full product record', () => {
    const raw: RawStripeProduct = {
      id: 'prod-001',
      object: 'product',
      name: 'Acme Pro',
      description: 'Pro subscription plan',
      active: true,
      created: 1709251200,
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('prod-001')
    expect(result.name).toBe('Acme Pro')
    expect(result.description).toBe('Pro subscription plan')
    expect(result.active).toBe(true)
    expect(result.gateway).toBe('stripe')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('handles product with no description', () => {
    const raw: RawStripeProduct = {
      id: 'prod-002',
      object: 'product',
      name: 'Basic Plan',
      active: false,
      created: 1709251200,
    }
    const result = transformProduct(raw)
    expect(result.description).toBeUndefined()
    expect(result.active).toBe(false)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
