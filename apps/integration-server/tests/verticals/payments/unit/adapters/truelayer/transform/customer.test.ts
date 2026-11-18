import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawStripeCustomer,
} from '../../../../../../../src/verticals/payments/adapters/truelayer/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('truelayer transformCustomer', () => {
  it('maps a customer with email, name, and billing address', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_tl_001',
      object: 'customer',
      email: 'alice@example.com',
      name: 'Alice Smith',
      address: {
        line1: '10 Downing St',
        city: 'London',
        postal_code: 'SW1A 2AA',
        country: 'GB',
      },
      created: 1709251200,
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_tl_001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Smith')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.gateway).toBe('stripe')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal customer with only id', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_tl_002',
      object: 'customer',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_tl_002')
    expect(result.email).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_tl_003',
      object: 'customer',
      email: 'bob@example.com',
      name: 'Bob Jones',
      currency: 'GBP',
    }
    const customer = transformCustomer(raw)
    const back = untransformCustomer(customer)
    expect(back.email).toBe('bob@example.com')
    expect(back.name).toBe('Bob Jones')
    expect(back.currency).toBe('gbp')
  })
})
