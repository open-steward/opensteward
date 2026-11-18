import { describe, it, expect } from 'vitest'
import { transformSubscription } from '../../../../../../../src/verticals/payments/adapters/solidgate/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'
import { subscription } from '../fixtures/documented'

describe('solidgate transformSubscription (subscriptions report)', () => {
  it('maps the documented example subscription', () => {
    const s = SubscriptionSchema.parse(transformSubscription(subscription()))
    expect(s.id).toBe('64e1c283-17bf-45a7-90ea-2cb938081b2f')
    expect(s.externalId).toBe(s.id)
    expect(s.customerId).toBe('93a1c659-288d-4d62-929d-10e241078faa')
    expect(s.status).toBe('cancelled')
    expect(s.currency).toBe('USD')
    expect(s.items).toEqual([
      {
        id: '64e1c283-17bf-45a7-90ea-2cb938081b2f:a51ba9fd-3be1-4ef9-b00f-bb85157597f5',
        productId: 'a51ba9fd-3be1-4ef9-b00f-bb85157597f5',
        amount: 100,
      },
    ])
    expect(s.cancelledAt).toBe('2025-06-26T06:43:58Z')
    expect(s.createdAt).toBe('2025-06-10T15:42:24Z')
    expect(s.updatedAt).toBe('2025-06-10T15:42:25Z')
    expect(s.metadata).toEqual({
      cancel_code: '8.01',
      cancel_message: 'Card brand is not supported',
    })
    expect(s.gateway).toBe('solidgate')
  })

  it.each([
    ['active', 'active'],
    ['cancelled', 'cancelled'],
    ['paused', 'paused'],
    ['redemption', 'past_due'],
    ['other', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    expect(
      SubscriptionSchema.parse(transformSubscription({ ...subscription(), status })).status,
    ).toBe(expected)
  })
})
