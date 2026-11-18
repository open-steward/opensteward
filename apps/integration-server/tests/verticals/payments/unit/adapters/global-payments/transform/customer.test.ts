import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawStripeCustomer,
} from '../../../../../../../src/verticals/payments/adapters/global-payments/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('global-payments transformCustomer', () => {
  it('maps a full customer record with address', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-001',
      object: 'customer',
      email: 'jane@example.com',
      name: 'Jane Doe',
      phone: '+14155550123',
      currency: 'usd',
      balance: 0,
      delinquent: false,
      address: {
        line1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'us',
      },
      created: 1709251200,
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus-001')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.currency).toBe('USD')
    expect(result.billingAddress?.country).toBe('US')
    expect(result.gateway).toBe('stripe')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps a minimal customer (id only)', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-002',
      object: 'customer',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus-002')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips email and name through untransformCustomer', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-003',
      object: 'customer',
      email: 'bob@example.com',
      name: 'Bob Smith',
    }
    const canonical = transformCustomer(raw)
    const wire = untransformCustomer(canonical)
    expect(wire.email).toBe('bob@example.com')
    expect(wire.name).toBe('Bob Smith')
    expect(() => CustomerSchema.parse(canonical)).not.toThrow()
  })

  it('prefers invoice_settings default_payment_method over default_source', () => {
    const raw: RawStripeCustomer = {
      id: 'cus-004',
      object: 'customer',
      default_source: 'src-old',
      invoice_settings: { default_payment_method: 'pm-new' },
    }
    const result = transformCustomer(raw)
    expect(result.defaultPaymentMethodId).toBe('pm-new')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
