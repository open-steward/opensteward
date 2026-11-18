import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawStripeProduct,
} from '../../../../../../../src/verticals/payments/adapters/zuora/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('zuora transformProduct', () => {
  it('maps id, name and gateway correctly', () => {
    const raw: RawStripeProduct = {
      id: 'zuora-prod-001',
      object: 'product',
      name: 'Zuora Enterprise Suite',
      description: 'Full suite billing platform',
      active: true,
      created: 1709251200,
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('zuora-prod-001')
    expect(result.name).toBe('Zuora Enterprise Suite')
    expect(result.description).toBe('Full suite billing platform')
    expect(result.active).toBe(true)
    expect(result.gateway).toBe('stripe')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps product without description', () => {
    const raw: RawStripeProduct = {
      id: 'zuora-prod-002',
      object: 'product',
      name: 'Zuora Starter',
      active: false,
    }
    const result = transformProduct(raw)
    expect(result.name).toBe('Zuora Starter')
    expect(result.active).toBe(false)
    expect(result.description).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
