import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawAdyenRecurringContract,
} from '../../../../../../../src/verticals/payments/adapters/adyen/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('adyen transformSubscription', () => {
  it('maps an active recurring contract to status "active"', () => {
    const raw: RawAdyenRecurringContract = {
      recurringDetailReference: 'RECUR-001',
      shopperReference: 'SHOPPER-1',
      contractType: 'RECURRING',
      amount: { value: 1999, currency: 'usd' },
      variant: 'visa',
      creationDate: '2024-03-01T00:00:00Z',
      expiryDate: '2030-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('RECUR-001')
    expect(result.customerId).toBe('SHOPPER-1')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.cancelAt).toBe('2030-03-01T00:00:00Z')
    expect(result.gateway).toBe('adyen')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps an expired recurring contract to status "expired"', () => {
    const raw: RawAdyenRecurringContract = {
      recurringDetailReference: 'RECUR-002',
      shopperReference: 'SHOPPER-2',
      amount: { value: 999, currency: 'eur' },
      creationDate: '2022-01-01T00:00:00Z',
      expiryDate: '2022-12-31T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(result.currency).toBe('EUR')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to EUR when currency is missing', () => {
    const raw: RawAdyenRecurringContract = {
      recurringDetailReference: 'RECUR-003',
      shopperReference: 'SHOPPER-3',
    }
    const result = transformSubscription(raw)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('active')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
