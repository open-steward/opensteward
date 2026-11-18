import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawStripeProduct,
} from '../../../../../../../src/verticals/payments/adapters/sumup/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('sumup transformProduct', () => {
  it('maps id, name and gateway', () => {
    const raw: RawStripeProduct = {
      id: 'prod_001',
      object: 'product',
      name: 'Pro Plan',
      active: true,
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('prod_001')
    expect(result.externalId).toBe('prod_001')
    expect(result.name).toBe('Pro Plan')
    expect(result.active).toBe(true)
    expect(result.gateway).toBe('stripe')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps description when present', () => {
    const raw: RawStripeProduct = {
      id: 'prod_002',
      object: 'product',
      name: 'Enterprise Plan',
      description: 'Full-featured plan for enterprise customers',
    }
    const result = transformProduct(raw)
    expect(result.description).toBe('Full-featured plan for enterprise customers')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('sets description to undefined when null', () => {
    const raw: RawStripeProduct = {
      id: 'prod_003',
      object: 'product',
      name: 'Basic Plan',
      description: null,
    }
    expect(transformProduct(raw).description).toBeUndefined()
  })

  it('maps metadata as string record', () => {
    const raw: RawStripeProduct = {
      id: 'prod_004',
      object: 'product',
      name: 'Starter',
      metadata: { category: 'software', rank: '1' },
    }
    const result = transformProduct(raw)
    expect(result.metadata['category']).toBe('software')
    expect(result.metadata['rank']).toBe('1')
  })

  it('maps createdAt from unix timestamp', () => {
    const raw: RawStripeProduct = {
      id: 'prod_005',
      object: 'product',
      name: 'Legacy Plan',
      created: 1709251200,
    }
    expect(transformProduct(raw).createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})
