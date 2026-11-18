import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawVerifone2checkoutSubscription,
} from '../../../../../../../src/verticals/payments/adapters/verifone-2checkout/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('verifone-2checkout transformSubscription', () => {
  it('maps ACTIVE status with full data', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-001',
      Status: 'ACTIVE',
      StartDate: '2024-01-01T00:00:00Z',
      ExpirationDate: '2024-12-31T23:59:59Z',
      NextBillingDate: '2024-02-01T00:00:00Z',
      RecurringEnabled: true,
      Currency: 'USD',
      Product: { ProductId: 'PROD-001', ProductName: 'Premium Plan' },
      EndUser: {
        Person: {
          Email: 'user@example.com',
          FirstName: 'John',
          LastName: 'Doe',
        },
      },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(result.id).toBe('SUB-001')
    expect(result.customerId).toBe('user@example.com')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('PROD-001')
    expect(result.items[0].productId).toBe('PROD-001')
    expect(result.cancelAtPeriodEnd).toBe(false)
    expect(result.gateway).toBe('verifone-2checkout')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps TRIAL status to "trialing"', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-002',
      Status: 'TRIAL',
      Currency: 'EUR',
      EndUser: { Person: { Email: 'trial@example.com' } },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('trialing')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps PASTDUE status to "past_due"', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-003',
      Status: 'PASTDUE',
      EndUser: { Person: { Email: 'pastdue@example.com' } },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps PAST_DUE status to "past_due"', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-004',
      Status: 'PAST_DUE',
      EndUser: { Person: { Email: 'pastdue2@example.com' } },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELED status to "cancelled"', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-005',
      Status: 'CANCELED',
      EndUser: { Person: { Email: 'canceled@example.com' } },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLED status to "cancelled"', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-006',
      Status: 'CANCELLED',
      EndUser: { Person: { Email: 'cancelled@example.com' } },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps EXPIRED status to "expired"', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-007',
      Status: 'EXPIRED',
      EndUser: { Person: { Email: 'expired@example.com' } },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps FINISHED status to "expired"', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-008',
      Status: 'FINISHED',
      EndUser: { Person: { Email: 'finished@example.com' } },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps HOLD status to "paused"', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-009',
      Status: 'HOLD',
      EndUser: { Person: { Email: 'hold@example.com' } },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps SUSPENDED status to "paused"', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-010',
      Status: 'SUSPENDED',
      EndUser: { Person: { Email: 'suspended@example.com' } },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('defaults unknown status to "active"', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-011',
      Status: 'UNKNOWN',
      EndUser: { Person: { Email: 'unknown@example.com' } },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('sets cancelAtPeriodEnd=true when RecurringEnabled=false', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-012',
      Status: 'ACTIVE',
      RecurringEnabled: false,
      EndUser: { Person: { Email: 'cancel@example.com' } },
    }
    const result = transformSubscription(raw)
    expect(result.cancelAtPeriodEnd).toBe(true)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('returns empty items array when Product has no ProductId', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-013',
      Status: 'ACTIVE',
      Product: { ProductName: 'Some Product' },
      EndUser: { Person: { Email: 'noprod@example.com' } },
    }
    const result = transformSubscription(raw)
    expect(result.items).toHaveLength(0)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('leaves currency undefined when Currency field is absent', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-014',
      Status: 'ACTIVE',
      EndUser: { Person: { Email: 'nocurr@example.com' } },
    }
    const result = transformSubscription(raw)
    expect(result.currency).toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('uses empty string customerId when EndUser.Person.Email is absent', () => {
    const raw: RawVerifone2checkoutSubscription = {
      SubscriptionReference: 'SUB-015',
      Status: 'ACTIVE',
    }
    const result = transformSubscription(raw)
    expect(result.customerId).toBe('')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
