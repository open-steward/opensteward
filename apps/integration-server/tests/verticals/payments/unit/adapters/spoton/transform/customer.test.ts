import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawStripeCustomer,
} from '../../../../../../../src/verticals/payments/adapters/spoton/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('spoton transformCustomer', () => {
  it('maps a full customer object', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_spoton_1',
      object: 'customer',
      email: 'alice@example.com',
      name: 'Alice Smith',
      phone: '+14155550100',
      currency: 'usd',
      balance: 0,
      delinquent: false,
      address: {
        line1: '123 Main St',
        city: 'San Francisco',
        postal_code: '94105',
        country: 'US',
      },
      metadata: { tier: 'pro' },
      created: 1709251200,
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_spoton_1')
    expect(result.email).toBe('alice@example.com')
    expect(result.currency).toBe('USD')
    expect(result.billingAddress?.country).toBe('US')
    expect(result.billingAddress?.city).toBe('San Francisco')
    expect(result.gateway).toBe('stripe')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_spoton_2',
      object: 'customer',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_spoton_2')
    expect(result.email).toBeUndefined()
    expect(result.currency).toBeUndefined()
    expect(result.billingAddress).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips through untransformCustomer', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_spoton_3',
      object: 'customer',
      email: 'bob@example.com',
      name: 'Bob Jones',
      currency: 'gbp',
      address: {
        line1: '10 Downing St',
        city: 'London',
        country: 'GB',
      },
    }
    const canonical = transformCustomer(raw)
    const back = untransformCustomer(canonical)
    expect(back.email).toBe('bob@example.com')
    expect(back.currency).toBe('gbp')
    expect((back.address as Record<string, unknown>)?.country).toBe('GB')
  })

  it('prefers invoice_settings.default_payment_method over default_source', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_spoton_4',
      object: 'customer',
      default_source: 'card_old',
      invoice_settings: { default_payment_method: 'pm_new' },
    }
    const result = transformCustomer(raw)
    expect(result.defaultPaymentMethodId).toBe('pm_new')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
