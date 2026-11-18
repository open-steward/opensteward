import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawStripeCustomer,
} from '../../../../../../../src/verticals/payments/adapters/yapily/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('yapily transformCustomer (stripe-scaffold)', () => {
  it('maps customer fields including billing address', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-001',
      object: 'customer',
      email: 'jane@example.com',
      name: 'Jane Doe',
      phone: '+442071234567',
      currency: 'gbp',
      balance: 0,
      delinquent: false,
      address: {
        line1: '10 Downing St',
        city: 'London',
        postal_code: 'SW1A 2AA',
        country: 'GB',
      },
      created: 1709251200,
    }
    const result = transformCustomer(raw)
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.currency).toBe('GBP')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.billingAddress?.country).toBe('GB')
    expect(result.gateway).toBe('stripe')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-002',
      object: 'customer',
      email: 'ali@example.com',
      name: 'Ali Baba',
      currency: 'usd',
      created: 1709251200,
    }
    const canonical = transformCustomer(raw)
    expect(() => CustomerSchema.parse(canonical)).not.toThrow()
    const unTransformed = untransformCustomer(canonical)
    expect(unTransformed.email).toBe('ali@example.com')
    expect(unTransformed.name).toBe('Ali Baba')
    expect(unTransformed.currency).toBe('usd')
  })
})
