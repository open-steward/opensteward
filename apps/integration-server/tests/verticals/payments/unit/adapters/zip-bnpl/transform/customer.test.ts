import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawStripeCustomer,
} from '../../../../../../../src/verticals/payments/adapters/zip-bnpl/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('zip-bnpl transformCustomer', () => {
  it('maps id, email and gateway correctly', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-zip-001',
      object: 'customer',
      email: 'buyer@example.com',
      name: 'Jane Doe',
      phone: '+15555550100',
      currency: 'usd',
      created: 1709251200,
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus-zip-001')
    expect(result.email).toBe('buyer@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('stripe')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps billing address fields', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-zip-002',
      object: 'customer',
      address: {
        line1: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        postal_code: '62701',
        country: 'US',
      },
    }
    const result = transformCustomer(raw)
    expect(result.billingAddress?.line1).toBe('123 Main St')
    expect(result.billingAddress?.country).toBe('US')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-zip-003',
      object: 'customer',
      email: 'rt@example.com',
      name: 'Round Trip',
      currency: 'gbp',
    }
    const result = transformCustomer(raw)
    const back = untransformCustomer(result)
    expect(back.email).toBe('rt@example.com')
    expect(back.name).toBe('Round Trip')
    expect(back.currency).toBe('gbp')
  })
})
