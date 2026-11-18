import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawStripeCustomer,
} from '../../../../../../../src/verticals/payments/adapters/bridge-open-banking/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('bridge-open-banking transformCustomer', () => {
  it('maps a full customer record', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-001',
      object: 'customer',
      email: 'jane@example.com',
      name: 'Jane Doe',
      phone: '+14155550123',
      currency: 'usd',
      balance: 0,
      delinquent: false,
      created: 1709251200,
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus-001')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.currency).toBe('USD')
    expect(result.balance).toBe(0)
    expect(result.gateway).toBe('stripe')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps billing address from address field', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-002',
      object: 'customer',
      address: {
        line1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94105',
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

  it('handles minimal customer with no optional fields', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-003',
      object: 'customer',
      created: 1709251200,
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus-003')
    expect(result.email).toBeUndefined()
    expect(result.billingAddress).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
