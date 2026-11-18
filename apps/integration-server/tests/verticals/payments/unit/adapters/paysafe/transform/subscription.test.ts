import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawPaysafeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/paysafe/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('paysafe transformSubscription', () => {
  it('maps an active subscription with plan and profile', () => {
    const raw: RawPaysafeSubscription = {
      id: 'sub_001',
      merchantRefNum: 'sub-order-001',
      status: 'ACTIVE',
      plan: {
        id: 'plan_001',
        name: 'Pro Monthly',
        amount: 9900,
        currencyCode: 'USD',
        billingCycle: { frequency: 'MONTHLY', interval: 1 },
      },
      profile: { id: 'prof_001', merchantCustomerId: 'MCU-001', email: 'buyer@example.com' },
      paymentToken: 'tok_abc',
      billingPeriodStartDate: '2024-03-01T00:00:00Z',
      billingPeriodEndDate: '2024-04-01T00:00:00Z',
      creationTime: '2024-03-01T00:00:00Z',
    }

    const result = transformSubscription(raw)

    expect(result.id).toBe('sub_001')
    expect(result.externalId).toBe('sub_001')
    expect(result.customerId).toBe('prof_001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('plan_001')
    expect(result.items[0].amount).toBe(9900)
    expect(result.defaultPaymentMethodId).toBe('tok_abc')
    expect(result.currentPeriodStart).toBeDefined()
    expect(result.currentPeriodEnd).toBeDefined()
    expect(result.gateway).toBe('paysafe')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED subscription', () => {
    const raw: RawPaysafeSubscription = {
      id: 'sub_002',
      status: 'CANCELLED',
      profile: { merchantCustomerId: 'MCU-002' },
      reasonForCancellation: 'Customer request',
      effectiveCancellationDate: '2024-03-15T00:00:00Z',
      creationTime: '2024-03-01T00:00:00Z',
    }

    const result = transformSubscription(raw)

    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a PAST_DUE subscription', () => {
    const raw: RawPaysafeSubscription = {
      id: 'sub_003',
      status: 'PAST_DUE',
      profile: { id: 'prof_003' },
      creationTime: '2024-03-01T00:00:00Z',
    }

    const result = transformSubscription(raw)

    expect(result.status).toBe('past_due')
    expect(result.customerId).toBe('prof_003')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('falls back to profile.merchantCustomerId for customerId', () => {
    const raw: RawPaysafeSubscription = {
      id: 'sub_004',
      status: 'ACTIVE',
      profile: { merchantCustomerId: 'MCU-FALLBACK' },
      creationTime: '2024-03-01T00:00:00Z',
    }

    const result = transformSubscription(raw)

    expect(result.customerId).toBe('MCU-FALLBACK')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
