import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawStripeProduct,
} from '../../../../../../../src/verticals/payments/adapters/stitch/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('stitch transformProduct', () => {
  it('maps id, name, and gateway fields', () => {
    const raw: RawStripeProduct = {
      id: 'prod_stitch_001',
      object: 'product',
      name: 'Acme Pro',
    }
    const result = transformProduct(raw)
    expect(result.id).toBe('prod_stitch_001')
    expect(result.externalId).toBe('prod_stitch_001')
    expect(result.name).toBe('Acme Pro')
    expect(result.gateway).toBe('stripe')
  })

  it('maps description and active fields', () => {
    const raw: RawStripeProduct = {
      id: 'prod_stitch_002',
      object: 'product',
      name: 'Acme Starter',
      description: 'Entry-level plan',
      active: true,
    }
    const result = transformProduct(raw)
    expect(result.description).toBe('Entry-level plan')
    expect(result.active).toBe(true)
  })

  it('maps description as undefined when null', () => {
    const raw: RawStripeProduct = {
      id: 'prod_stitch_003',
      object: 'product',
      name: 'Acme Basic',
      description: null,
    }
    const result = transformProduct(raw)
    expect(result.description).toBeUndefined()
  })

  it('maps metadata as string record', () => {
    const raw: RawStripeProduct = {
      id: 'prod_stitch_004',
      object: 'product',
      name: 'Acme Enterprise',
      metadata: { category: 'B2B', tier: 'enterprise' },
    }
    const result = transformProduct(raw)
    expect(result.metadata.category).toBe('B2B')
    expect(result.metadata.tier).toBe('enterprise')
  })

  it('converts unix created to ISO string', () => {
    const raw: RawStripeProduct = {
      id: 'prod_stitch_005',
      object: 'product',
      name: 'Acme Plus',
      created: 1709251200,
    }
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes ProductSchema validation', () => {
    const raw: RawStripeProduct = {
      id: 'prod_stitch_006',
      object: 'product',
      name: 'Acme Business',
      description: 'Business tier plan',
      active: true,
      created: 1709251200,
      metadata: { vertical: 'saas' },
    }
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
