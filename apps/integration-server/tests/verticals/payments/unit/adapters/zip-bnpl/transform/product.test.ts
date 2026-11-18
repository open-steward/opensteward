import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawStripeProduct,
} from '../../../../../../../src/verticals/payments/adapters/zip-bnpl/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('zip-bnpl transformProduct', () => {
  it('maps id, name and gateway correctly', () => {
    const raw: RawStripeProduct = {
      id: 'zip-prod-001',
      object: 'product',
      name: 'Zip Monthly Plan',
      description: 'Buy now pay later monthly',
      active: true,
      created: 1709251200,
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('zip-prod-001')
    expect(result.name).toBe('Zip Monthly Plan')
    expect(result.description).toBe('Buy now pay later monthly')
    expect(result.active).toBe(true)
    expect(result.gateway).toBe('stripe')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps inactive product without description', () => {
    const raw: RawStripeProduct = {
      id: 'zip-prod-002',
      object: 'product',
      name: 'Zip Annual Plan',
      active: false,
    }
    const result = transformProduct(raw)
    expect(result.name).toBe('Zip Annual Plan')
    expect(result.active).toBe(false)
    expect(result.description).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
