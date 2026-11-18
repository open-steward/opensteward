import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawStripeCustomer,
} from '../../../../../../../src/verticals/payments/adapters/tyro/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('tyro transformCustomer', () => {
  it('maps a customer with email, name, and billing address', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_tyro_001',
      object: 'customer',
      email: 'john.smith@example.com.au',
      name: 'John Smith',
      address: {
        line1: '1 George St',
        city: 'Sydney',
        state: 'NSW',
        postal_code: '2000',
        country: 'AU',
      },
      created: 1709251200,
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_tyro_001')
    expect(result.email).toBe('john.smith@example.com.au')
    expect(result.billingAddress?.city).toBe('Sydney')
    expect(result.billingAddress?.country).toBe('AU')
    expect(result.gateway).toBe('stripe')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal customer', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_tyro_002',
      object: 'customer',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_tyro_002')
    expect(result.email).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_tyro_003',
      object: 'customer',
      email: 'alice@example.com',
      name: 'Alice',
      currency: 'AUD',
    }
    const customer = transformCustomer(raw)
    const back = untransformCustomer(customer)
    expect(back.email).toBe('alice@example.com')
    expect(back.currency).toBe('aud')
  })
})
