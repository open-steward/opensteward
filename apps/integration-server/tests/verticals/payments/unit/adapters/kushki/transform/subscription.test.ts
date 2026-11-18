import { describe, it, expect } from 'vitest'
import { transformSubscription } from '../../../../../../../src/verticals/payments/adapters/kushki/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'
import { SUBSCRIPTION } from '../fixtures'

describe('kushki transformSubscription (get recurring charge info)', () => {
  it('maps the documented default example', () => {
    const s = SubscriptionSchema.parse(transformSubscription(SUBSCRIPTION))
    expect(s.id).toBe('1574693127852000')
    expect(s.customerId).toBe('user@example.com')
    expect(s.status).toBe('unknown')
    expect(s.currency).toBe('MXN')
    expect(s.items).toEqual([])
    expect(s.createdAt).toBe('2019-11-25T14:45:27.000Z')
    expect(s.metadata).toEqual({ codeUser: '1', codeCompra: 'd93d7a6' })
  })

  it('throws without a subscriptionId or contact email', () => {
    expect(() => transformSubscription({ ...SUBSCRIPTION, subscriptionId: undefined })).toThrow(
      /subscriptionId/,
    )
    expect(() => transformSubscription({ ...SUBSCRIPTION, contactDetails: {} })).toThrow(
      /contactDetails.email/,
    )
  })
})
