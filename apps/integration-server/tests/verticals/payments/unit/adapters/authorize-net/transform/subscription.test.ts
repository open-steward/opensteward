import { describe, it, expect } from 'vitest'
import {
  transformSubscriptionMasked,
  transformSubscriptionDetail,
  type RawAuthNetSubscriptionMasked,
  type RawAuthNetSubscriptionDetail,
} from '../../../../../../../src/verticals/payments/adapters/authorize-net/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('authorize-net transformSubscriptionMasked', () => {
  const base: RawAuthNetSubscriptionMasked = {
    name: 'Pro Plan',
    paymentSchedule: {
      interval: { length: 1, unit: 'months' },
      startDate: '2024-01-01',
      totalOccurrences: 12,
      trialOccurrences: 0,
    },
    amount: '29.99',
    trialAmount: '0.00',
    status: 'active',
    profile: {
      customerProfileId: 'profile-111',
      paymentProfile: { customerPaymentProfileId: 'payprof-222' },
    },
  }

  it('maps subscriptionId to id and externalId', () => {
    const result = transformSubscriptionMasked('sub-masked-1', base)
    expect(result.id).toBe('sub-masked-1')
    expect(result.externalId).toBe('sub-masked-1')
  })

  it('maps customerProfileId to customerId', () => {
    const result = transformSubscriptionMasked('sub-masked-1', base)
    expect(result.customerId).toBe('profile-111')
  })

  it('maps active status', () => {
    const result = transformSubscriptionMasked('sub-masked-1', base)
    expect(result.status).toBe('active')
  })

  it('converts amount to minor units in items', () => {
    const result = transformSubscriptionMasked('sub-masked-1', base)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.amount).toBe(2999) // 29.99 * 100
  })

  it('maps defaultPaymentMethodId as composite of profile IDs', () => {
    const result = transformSubscriptionMasked('sub-masked-1', base)
    expect(result.defaultPaymentMethodId).toBe('profile-111:payprof-222')
  })

  it('maps currentPeriodStart from startDate ISO', () => {
    const result = transformSubscriptionMasked('sub-masked-1', base)
    expect(result.currentPeriodStart).toMatch(/^2024-01-01/)
  })

  it('maps suspended status to past_due', () => {
    const result = transformSubscriptionMasked('sub-masked-1', { ...base, status: 'suspended' })
    expect(result.status).toBe('past_due')
  })

  it('maps canceled status to cancelled', () => {
    const result = transformSubscriptionMasked('sub-masked-1', { ...base, status: 'canceled' })
    expect(result.status).toBe('cancelled')
  })

  it('maps expired status to expired', () => {
    const result = transformSubscriptionMasked('sub-masked-1', { ...base, status: 'expired' })
    expect(result.status).toBe('expired')
  })

  it('puts interval metadata', () => {
    const result = transformSubscriptionMasked('sub-masked-1', base)
    expect(result.metadata['interval_unit']).toBe('months')
    expect(result.metadata['interval_length']).toBe('1')
  })

  it('sets gateway to authorize-net', () => {
    const result = transformSubscriptionMasked('sub-masked-1', base)
    expect(result.gateway).toBe('authorize-net')
  })

  it('conforms to SubscriptionSchema', () => {
    expect(() =>
      SubscriptionSchema.parse(transformSubscriptionMasked('sub-masked-1', base)),
    ).not.toThrow()
  })
})

describe('authorize-net transformSubscriptionDetail', () => {
  const base: RawAuthNetSubscriptionDetail = {
    id: 'sub-detail-2',
    name: 'Starter Plan',
    status: 'active',
    createTimeStampUTC: '2024-02-01T00:00:00Z',
    firstName: 'Alice',
    lastName: 'Smith',
    totalOccurrences: 6,
    pastOccurrences: 2,
    accountNumber: 'XXXX1234',
    amount: '9.99',
    currencyCode: 'USD',
    customerProfileId: 'profile-333',
    customerPaymentProfileId: 'payprof-444',
  }

  it('maps id and customerId from customerProfileId', () => {
    const result = transformSubscriptionDetail(base)
    expect(result.id).toBe('sub-detail-2')
    expect(result.customerId).toBe('profile-333')
  })

  it('converts amount to minor units in items', () => {
    const result = transformSubscriptionDetail(base)
    expect(result.items[0]!.amount).toBe(999) // 9.99 * 100
  })

  it('maps currency from currencyCode', () => {
    const result = transformSubscriptionDetail(base)
    expect(result.currency).toBe('USD')
  })

  it('maps status to active', () => {
    const result = transformSubscriptionDetail(base)
    expect(result.status).toBe('active')
  })

  it('puts first_name, last_name, and account_number in metadata', () => {
    const result = transformSubscriptionDetail(base)
    expect(result.metadata['first_name']).toBe('Alice')
    expect(result.metadata['last_name']).toBe('Smith')
    expect(result.metadata['account_number']).toBe('XXXX1234')
  })

  it('sets gateway to authorize-net', () => {
    const result = transformSubscriptionDetail(base)
    expect(result.gateway).toBe('authorize-net')
  })

  it('conforms to SubscriptionSchema', () => {
    expect(() => SubscriptionSchema.parse(transformSubscriptionDetail(base))).not.toThrow()
  })
})
