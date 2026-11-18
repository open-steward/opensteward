import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawNuveiSubscription,
} from '../../../../../../../src/verticals/payments/adapters/nuvei/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('nuvei transformSubscription', () => {
  it('maps an ACTIVE subscription to canonical Subscription', () => {
    const raw: RawNuveiSubscription = {
      subscriptionId: 'sub_001',
      userTokenId: 'user_tok_abc',
      currency: 'usd',
      recurringAmount: '29.99',
      status: 'ACTIVE',
      planId: 'plan_monthly',
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-02-01T00:00:00Z',
      userPaymentOptionId: 'upo_42',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub_001')
    expect(result.externalId).toBe('sub_001')
    expect(result.customerId).toBe('user_tok_abc')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].amount).toBe(2999)
    expect(result.defaultPaymentMethodId).toBe('upo_42')
    expect(result.collectionMethod).toBe('charge_automatically')
    expect(result.gateway).toBe('nuvei')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLED status and sets cancelledAt from endDate', () => {
    const raw: RawNuveiSubscription = {
      subscriptionId: 'sub_002',
      userTokenId: 'user_tok_def',
      currency: 'EUR',
      recurringAmount: '9.99',
      status: 'CANCELLED',
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-03-15T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBe('2024-03-15T00:00:00.000Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps EXPIRED status to expired', () => {
    const raw: RawNuveiSubscription = {
      subscriptionId: 'sub_003',
      userTokenId: 'user_tok_ghi',
      status: 'EXPIRED',
      recurringAmount: '0.00',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(result.cancelledAt).toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps SUSPENDED status to paused', () => {
    const raw: RawNuveiSubscription = {
      subscriptionId: 'sub_004',
      userTokenId: 'user_tok_jkl',
      status: 'SUSPENDED',
      recurringAmount: '15.00',
      currency: 'GBP',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('defaults to active status for unknown status values', () => {
    const raw: RawNuveiSubscription = {
      subscriptionId: 'sub_005',
      userTokenId: 'user_tok_mno',
      status: 'UNKNOWN_STATUS',
      recurringAmount: '5.00',
      currency: 'USD',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('produces empty items array when recurringAmount is absent', () => {
    const raw: RawNuveiSubscription = {
      subscriptionId: 'sub_006',
      userTokenId: 'user_tok_pqr',
      status: 'ACTIVE',
      currency: 'USD',
    }
    const result = transformSubscription(raw)
    expect(result.items).toEqual([])
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('omits currency when raw currency is absent', () => {
    const raw: RawNuveiSubscription = {
      subscriptionId: 'sub_007',
      userTokenId: 'user_tok_stu',
      status: 'ACTIVE',
      recurringAmount: '10.00',
    }
    const result = transformSubscription(raw)
    expect(result.currency).toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('stores planId and initialTransactionId in metadata', () => {
    const raw: RawNuveiSubscription = {
      subscriptionId: 'sub_008',
      userTokenId: 'user_tok_vwx',
      status: 'ACTIVE',
      currency: 'USD',
      recurringAmount: '20.00',
      planId: 'plan_abc',
      initialTransactionId: 'txn_init_001',
      initialAmount: '0.00',
    }
    const result = transformSubscription(raw)
    expect(result.metadata.planId).toBe('plan_abc')
    expect(result.metadata.initialTransactionId).toBe('txn_init_001')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('does not set cancelledAt when status is not cancelled', () => {
    const raw: RawNuveiSubscription = {
      subscriptionId: 'sub_009',
      userTokenId: 'user_tok_yz',
      status: 'ACTIVE',
      recurringAmount: '30.00',
      currency: 'USD',
      endDate: '2025-12-31T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.cancelledAt).toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
