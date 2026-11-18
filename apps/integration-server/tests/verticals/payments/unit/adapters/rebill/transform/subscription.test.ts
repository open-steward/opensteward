import { describe, it, expect } from 'vitest'
import { transformSubscription } from '../../../../../../../src/verticals/payments/adapters/rebill/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'
import { documentedSubscription } from '../fixtures/documented'

describe('rebill transformSubscription', () => {
  it('maps the documented subscription object', () => {
    const s = SubscriptionSchema.parse(transformSubscription(documentedSubscription()))
    expect(s.id).toBe('sub_ad128372a40b8dbac50a8ca20c7305b')
    expect(s.customerId).toBe('cus_647838573cf58d61bc659f6525f528ba')
    expect(s.status).toBe('active')
    expect(s.currency).toBe('ARS')
    expect(s.items).toEqual([{ id: 'pln_647838573cf58d61bc659f6525f528ba', amount: 1_500_000 }])
    expect(s.metadata).toEqual({ customField: 'value' })
    expect(s.createdAt).toBe('2026-03-05T15:59:59.000Z')
    expect(s.updatedAt).toBe('2026-03-05T16:00:00.000Z')
  })

  it.each([
    ['active', 'active', 'active'],
    ['active', 'in_trial', 'trialing'],
    ['paused', 'paused', 'paused'],
    ['retrying', 'active', 'past_due'],
    ['cancelled', 'cancelled', 'cancelled'],
    ['finished', 'finished', 'expired'],
    ['defaulted', 'defaulted', 'unknown'],
    ['processing', 'active', 'unknown'],
  ])('maps status %s / statusDetail %s to %s', (status, statusDetail, expected) => {
    const s = SubscriptionSchema.parse(
      transformSubscription({ ...documentedSubscription(), status, statusDetail }),
    )
    expect(s.status).toBe(expected)
  })

  it('throws when customer.id is missing', () => {
    expect(() => transformSubscription({ ...documentedSubscription(), customer: null })).toThrow(
      /customer\.id/,
    )
  })
})
