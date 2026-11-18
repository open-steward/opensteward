import { describe, it, expect } from 'vitest'
import { transformSubscription } from '../../../../../../../src/verticals/payments/adapters/xendit/transform/subscription'
import type { RawXenditRecurringPlan } from '../../../../../../../src/verticals/payments/adapters/xendit/transform/plan'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('xendit transformSubscription', () => {
  it('maps an ACTIVE plan to subscription with status "active"', () => {
    const raw: RawXenditRecurringPlan = {
      id: 'plan-001',
      reference_id: 'ref-001',
      customer_id: 'cust-1',
      currency: 'IDR',
      amount: 150000,
      status: 'ACTIVE',
      schedule: {
        interval: 'MONTH',
        interval_count: 1,
        anchor_date: '2024-03-01T00:00:00Z',
      },
      created: '2024-03-01T00:00:00Z',
      updated: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('cust-1')
    expect(result.currency).toBe('IDR')
    expect(result.items).toEqual([])
    expect(result.gateway).toBe('xendit')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps an INACTIVE plan to status "cancelled" and sets cancelledAt', () => {
    const raw: RawXenditRecurringPlan = {
      id: 'plan-002',
      customer_id: 'cust-2',
      currency: 'PHP',
      amount: 99900,
      status: 'INACTIVE',
      schedule: {},
      created: '2024-03-01T00:00:00Z',
      updated: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING plan to status "incomplete"', () => {
    const raw: RawXenditRecurringPlan = {
      id: 'plan-003',
      customer_id: 'cust-3',
      currency: 'IDR',
      amount: 50000,
      status: 'PENDING',
      schedule: {},
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(result.cancelledAt).toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
