import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawPhonepeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/phonepe/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('phonepe transformSubscription', () => {
  // epoch-ms 1709251200000 = 2024-03-01T00:00:00.000Z
  const EPOCH_MS = 1709251200000
  // epoch-ms for expiry: 1740787200000 = 2025-03-01T00:00:00.000Z
  const EXPIRE_MS = 1740787200000

  it('maps an ACTIVE subscription correctly', () => {
    const raw: RawPhonepeSubscription = {
      merchantSubscriptionId: 'MERCH-SUB-001',
      subscriptionId: 'phonepe-sub-001',
      state: 'ACTIVE',
      currency: 'INR',
      frequency: 'MONTHLY',
      maxAmount: 10000,
      expireAt: EXPIRE_MS,
      createdAt: EPOCH_MS,
    }
    const result = transformSubscription(raw)
    // id from merchantSubscriptionId
    expect(result.id).toBe('MERCH-SUB-001')
    // externalId from subscriptionId
    expect(result.externalId).toBe('phonepe-sub-001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('INR')
    expect(result.customerId).toBe('')
    expect(result.items).toEqual([])
    expect(result.cancelAtPeriodEnd).toBe(false)
    expect(result.gateway).toBe('phonepe')
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.currentPeriodEnd).toBe('2025-03-01T00:00:00.000Z')
    expect(result.cancelledAt).toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLED state correctly and sets cancelledAt', () => {
    const raw: RawPhonepeSubscription = {
      merchantSubscriptionId: 'MERCH-SUB-002',
      subscriptionId: 'phonepe-sub-002',
      state: 'CANCELLED',
      currency: 'INR',
      expireAt: EXPIRE_MS,
      createdAt: EPOCH_MS,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    // cancelledAt set because state contains 'CANCEL'
    expect(result.cancelledAt).toBe('2025-03-01T00:00:00.000Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps PAUSED state correctly', () => {
    const raw: RawPhonepeSubscription = {
      merchantSubscriptionId: 'MERCH-SUB-003',
      subscriptionId: 'phonepe-sub-003',
      state: 'PAUSED',
      currency: 'INR',
      expireAt: EXPIRE_MS,
      createdAt: EPOCH_MS,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(result.cancelledAt).toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps EXPIRED state correctly', () => {
    const raw: RawPhonepeSubscription = {
      merchantSubscriptionId: 'MERCH-SUB-004',
      subscriptionId: 'phonepe-sub-004',
      state: 'EXPIRED',
      currency: 'INR',
      expireAt: EXPIRE_MS,
      createdAt: EPOCH_MS,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(result.cancelledAt).toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps REVOKED state to cancelled and sets cancelledAt', () => {
    const raw: RawPhonepeSubscription = {
      merchantSubscriptionId: 'MERCH-SUB-005',
      subscriptionId: 'phonepe-sub-005',
      state: 'REVOKED',
      currency: 'INR',
      expireAt: EXPIRE_MS,
      createdAt: EPOCH_MS,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    // cancelledAt set because state contains 'REVOK'
    expect(result.cancelledAt).toBe('2025-03-01T00:00:00.000Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to INR when not provided', () => {
    const raw: RawPhonepeSubscription = {
      merchantSubscriptionId: 'MERCH-SUB-006',
      subscriptionId: 'phonepe-sub-006',
      state: 'ACTIVE',
      createdAt: EPOCH_MS,
    }
    const result = transformSubscription(raw)
    expect(result.currency).toBe('INR')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('populates metadata from subscription fields', () => {
    const raw: RawPhonepeSubscription = {
      merchantSubscriptionId: 'MERCH-SUB-007',
      subscriptionId: 'phonepe-sub-007',
      state: 'ACTIVE',
      currency: 'INR',
      productType: 'RECURRING',
      authInstrumentType: 'UPI',
      frequency: 'WEEKLY',
      maxAmount: 5000,
      createdAt: EPOCH_MS,
    }
    const result = transformSubscription(raw)
    expect(result.metadata['productType']).toBe('RECURRING')
    expect(result.metadata['authInstrumentType']).toBe('UPI')
    expect(result.metadata['frequency']).toBe('WEEKLY')
    expect(result.metadata['maxAmount']).toBe('5000')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
