import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawBraintreeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/braintree/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('braintree transformSubscription', () => {
  it('maps an ACTIVE subscription to canonical', () => {
    const raw: RawBraintreeSubscription = {
      id: 'sub_001',
      status: 'ACTIVE',
      plan: { id: 'plan_001' },
      paymentMethod: { id: 'pm_001' },
      price: { value: '29.99', currencyIsoCode: 'USD' },
      billingPeriodStartDate: '2024-03-01T00:00:00Z',
      billingPeriodEndDate: '2024-04-01T00:00:00Z',
      nextBillingDate: '2024-04-01T00:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub_001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.items).toEqual([{ id: 'plan_001', priceId: 'plan_001' }])
    expect(result.defaultPaymentMethodId).toBe('pm_001')
    expect(result.currentPeriodStart).toBe('2024-03-01T00:00:00Z')
    expect(result.currentPeriodEnd).toBe('2024-04-01T00:00:00Z')
    expect(result.createdAt).toBe('2024-01-01T00:00:00Z')
    expect(result.gateway).toBe('braintree')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELED subscription to status "cancelled"', () => {
    const raw: RawBraintreeSubscription = {
      id: 'sub_002',
      status: 'CANCELED',
      price: { value: '9.99', currencyIsoCode: 'EUR' },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.currency).toBe('EUR')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a PAST_DUE subscription to status "past_due"', () => {
    const raw: RawBraintreeSubscription = {
      id: 'sub_003',
      status: 'PAST_DUE',
      price: { value: '19.99', currencyIsoCode: 'GBP' },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING subscription to status "incomplete"', () => {
    const raw: RawBraintreeSubscription = {
      id: 'sub_004',
      status: 'PENDING',
      price: { value: '5.00', currencyIsoCode: 'USD' },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('produces empty items array when plan is absent', () => {
    const raw: RawBraintreeSubscription = {
      id: 'sub_005',
      status: 'ACTIVE',
      price: { value: '0.00', currencyIsoCode: 'USD' },
    }
    const result = transformSubscription(raw)
    expect(result.items).toEqual([])
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a trialEndDate to trialEnd', () => {
    const raw: RawBraintreeSubscription = {
      id: 'sub_006',
      status: 'ACTIVE',
      price: { value: '14.99', currencyIsoCode: 'USD' },
      trialEndDate: '2024-03-15T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.trialEnd).toBe('2024-03-15T00:00:00Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
