import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawIxopaySchedule,
} from '../../../../../../../src/verticals/payments/adapters/ixopay/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('ixopay transformSubscription', () => {
  it('maps newStatus ACTIVE to "active" and sets IDs', () => {
    const raw: RawIxopaySchedule = {
      scheduleId: 'sched-001',
      registrationId: 'reg-001',
      newStatus: 'ACTIVE',
      scheduledAt: '2024-03-01T00:00:00Z',
      currency: 'eur',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(result.id).toBe('sched-001')
    expect(result.customerId).toBe('reg-001')
    expect(result.currency).toBe('EUR')
    expect(result.gateway).toBe('ixopay')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps newStatus PAUSED to "paused"', () => {
    const raw: RawIxopaySchedule = {
      scheduleId: 'sched-002',
      registrationId: 'reg-002',
      newStatus: 'PAUSED',
      scheduledAt: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps newStatus CANCELLED to "cancelled" and sets cancelledAt', () => {
    const raw: RawIxopaySchedule = {
      scheduleId: 'sched-003',
      registrationId: 'reg-003',
      newStatus: 'CANCELLED',
      scheduledAt: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps newStatus CREATE-PENDING to "incomplete"', () => {
    const raw: RawIxopaySchedule = {
      scheduleId: 'sched-004',
      registrationId: 'reg-004',
      newStatus: 'CREATE-PENDING',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
