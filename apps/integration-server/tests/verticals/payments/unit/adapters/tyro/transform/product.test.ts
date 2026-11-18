import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawStripeProduct,
} from '../../../../../../../src/verticals/payments/adapters/tyro/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('tyro transformProduct', () => {
  it('maps a product with name and description', () => {
    const raw: RawStripeProduct = {
      id: 'prod_tyro_001',
      object: 'product',
      name: 'Tyro POS Terminal',
      description: 'EFTPOS terminal with integrated payment processing',
      active: true,
      created: 1709251200,
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('prod_tyro_001')
    expect(result.name).toBe('Tyro POS Terminal')
    expect(result.description).toBe('EFTPOS terminal with integrated payment processing')
    expect(result.active).toBe(true)
    expect(result.gateway).toBe('stripe')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal product', () => {
    const raw: RawStripeProduct = {
      id: 'prod_tyro_002',
      object: 'product',
      name: 'Software Subscription',
    }
    const result = transformProduct(raw)
    expect(result.name).toBe('Software Subscription')
    expect(result.description).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
