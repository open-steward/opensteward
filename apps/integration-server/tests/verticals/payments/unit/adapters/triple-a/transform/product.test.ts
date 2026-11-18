import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawStripeProduct,
} from '../../../../../../../src/verticals/payments/adapters/triple-a/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('triple-a transformProduct', () => {
  it('maps an active product with description', () => {
    const raw: RawStripeProduct = {
      id: 'prod-ta-001',
      object: 'product',
      name: 'Crypto Gateway Pro',
      description: 'Accept crypto payments globally',
      active: true,
      created: 1709251200,
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('prod-ta-001')
    expect(result.name).toBe('Crypto Gateway Pro')
    expect(result.description).toBe('Accept crypto payments globally')
    expect(result.active).toBe(true)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps an inactive product without description', () => {
    const raw: RawStripeProduct = {
      id: 'prod-ta-002',
      object: 'product',
      name: 'Legacy Plan',
      active: false,
      created: 1709251200,
    }
    const result = transformProduct(raw)
    expect(result.name).toBe('Legacy Plan')
    expect(result.active).toBe(false)
    expect(result.description).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
