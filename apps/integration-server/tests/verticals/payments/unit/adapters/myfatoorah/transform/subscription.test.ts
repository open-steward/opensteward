import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawMyfatoorahRecurringPayment,
} from '../../../../../../../src/verticals/payments/adapters/myfatoorah/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('myfatoorah transformSubscription', () => {
  it('maps an active recurring payment with all fields', () => {
    const raw: RawMyfatoorahRecurringPayment = {
      RecurringId: 'REC-001',
      RecurringStatus: 'active',
      RecurringValue: 29.99,
      CustomerReference: 'CUST-001',
      IsActive: true,
      LastPayDate: '2024-03-01T00:00:00Z',
      NextPayDate: '2024-04-01T00:00:00Z',
      CreationDate: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('REC-001')
    expect(result.externalId).toBe('REC-001')
    expect(result.customerId).toBe('CUST-001')
    expect(result.status).toBe('active')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('REC-001')
    expect(result.items[0].amount).toBe(2999)
    expect(result.currentPeriodStart).toBe('2024-03-01T00:00:00Z')
    expect(result.currentPeriodEnd).toBe('2024-04-01T00:00:00Z')
    expect(result.gateway).toBe('myfatoorah')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled recurring payment', () => {
    const raw: RawMyfatoorahRecurringPayment = {
      RecurringId: 'REC-002',
      RecurringStatus: 'cancelled',
      RecurringValue: 9.99,
      CustomerReference: 'CUST-002',
      IsActive: false,
      CancellationDate: '2024-03-01T00:00:00Z',
      CreationDate: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBe('2024-03-01T00:00:00Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a completed recurring payment to "expired"', () => {
    const raw: RawMyfatoorahRecurringPayment = {
      RecurringId: 'REC-003',
      RecurringStatus: 'completed',
      RecurringValue: 19.99,
      CustomerReference: 'CUST-003',
      IsActive: false,
      CreationDate: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a paused recurring payment', () => {
    const raw: RawMyfatoorahRecurringPayment = {
      RecurringId: 'REC-004',
      RecurringStatus: 'paused',
      RecurringValue: 14.99,
      CustomerReference: 'CUST-004',
      IsActive: false,
      CreationDate: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a draft recurring payment to "incomplete"', () => {
    const raw: RawMyfatoorahRecurringPayment = {
      RecurringId: 'REC-005',
      RecurringStatus: 'draft',
      RecurringValue: 5.0,
      CustomerReference: 'CUST-005',
      IsActive: false,
      CreationDate: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('active when IsActive is true even if status is unknown', () => {
    const raw: RawMyfatoorahRecurringPayment = {
      RecurringId: 'REC-006',
      RecurringStatus: 'unknown_status',
      RecurringValue: 10.0,
      CustomerId: 'CUST-006',
      IsActive: true,
      CreationDate: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('CUST-006')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
