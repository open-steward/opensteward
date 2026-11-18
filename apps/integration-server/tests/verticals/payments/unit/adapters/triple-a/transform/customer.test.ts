import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawStripeCustomer,
} from '../../../../../../../src/verticals/payments/adapters/triple-a/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('triple-a transformCustomer', () => {
  it('maps a full customer record', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-ta-001',
      object: 'customer',
      email: 'crypto@example.com',
      name: 'Crypto User',
      phone: '+14155550199',
      currency: 'usd',
      balance: 0,
      delinquent: false,
      created: 1709251200,
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus-ta-001')
    expect(result.email).toBe('crypto@example.com')
    expect(result.name).toBe('Crypto User')
    expect(result.currency).toBe('USD')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a customer with billing address', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-ta-002',
      object: 'customer',
      address: {
        line1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'US',
      },
      created: 1709251200,
    }
    const result = transformCustomer(raw)
    expect(result.billingAddress?.line1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('San Francisco')
    expect(result.billingAddress?.country).toBe('US')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips name via untransformCustomer', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-ta-003',
      object: 'customer',
      name: 'Test Name',
    }
    const transformed = transformCustomer(raw)
    const back = untransformCustomer(transformed)
    expect(back.name).toBe('Test Name')
  })
})
