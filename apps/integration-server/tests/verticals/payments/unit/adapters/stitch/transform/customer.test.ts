import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawStripeCustomer,
} from '../../../../../../../src/verticals/payments/adapters/stitch/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('stitch transformCustomer', () => {
  it('maps id, email, name, and gateway fields', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_stitch_001',
      object: 'customer',
      email: 'alice@example.com',
      name: 'Alice',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus_stitch_001')
    expect(result.externalId).toBe('cus_stitch_001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice')
    expect(result.gateway).toBe('stripe')
  })

  it('upper-cases currency', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_stitch_002',
      object: 'customer',
      currency: 'eur',
    }
    const result = transformCustomer(raw)
    expect(result.currency).toBe('EUR')
  })

  it('maps billing address with country upper-cased', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_stitch_003',
      object: 'customer',
      address: {
        line1: '123 Main St',
        city: 'London',
        postal_code: 'SW1A 1AA',
        country: 'gb',
      },
    }
    const result = transformCustomer(raw)
    expect(result.billingAddress?.line1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.billingAddress?.country).toBe('GB')
  })

  it('prefers invoice_settings.default_payment_method over default_source', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_stitch_004',
      object: 'customer',
      invoice_settings: { default_payment_method: 'pm_primary' },
      default_source: 'card_fallback',
    }
    const result = transformCustomer(raw)
    expect(result.defaultPaymentMethodId).toBe('pm_primary')
  })

  it('falls back to default_source when invoice_settings is absent', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_stitch_005',
      object: 'customer',
      default_source: 'card_fallback',
    }
    const result = transformCustomer(raw)
    expect(result.defaultPaymentMethodId).toBe('card_fallback')
  })

  it('converts unix created to ISO string', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_stitch_006',
      object: 'customer',
      created: 1709251200,
    }
    const result = transformCustomer(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes CustomerSchema validation', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_stitch_007',
      object: 'customer',
      email: 'bob@example.com',
      name: 'Bob',
      currency: 'usd',
      created: 1709251200,
      metadata: { tier: 'pro' },
    }
    const result = transformCustomer(raw)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips through untransformCustomer preserving email and currency', () => {
    const raw: RawStripeCustomer = {
      id: 'cus_stitch_008',
      object: 'customer',
      email: 'charlie@example.com',
      name: 'Charlie',
      currency: 'gbp',
      address: {
        line1: '1 Baker St',
        city: 'London',
        postal_code: 'NW1 6XE',
        country: 'GB',
      },
      metadata: { plan: 'business' },
    }
    const canonical = transformCustomer(raw)
    const back = untransformCustomer(canonical)
    expect(back.email).toBe('charlie@example.com')
    expect(back.currency).toBe('gbp')
    expect((back.address as Record<string, unknown> | undefined)?.country).toBe('GB')
  })
})
