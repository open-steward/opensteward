import { describe, it, expect } from 'vitest'
import { transformSubscription } from '../../../../../../../src/verticals/payments/adapters/stark-bank/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'
import { DOC_SUBSCRIPTION } from '../fixtures/docs'

describe('stark-bank transformSubscription', () => {
  it('maps the documented list example (variable amount)', () => {
    const result = SubscriptionSchema.parse(transformSubscription(DOC_SUBSCRIPTION))
    expect(result).toMatchObject({
      id: '6633844090339328',
      externalId: '6633844090339328',
      customerId: '012.345.678-90',
      status: 'incomplete',
      currency: 'BRL',
      items: [],
      billingAnchor: '2025-09-14T03:00:00.000Z',
      cancelAt: '2025-10-14T03:00:00.000Z',
      gateway: 'stark-bank',
      metadata: {},
      createdAt: '2025-09-09T21:34:55.854Z',
      updatedAt: '2025-09-09T21:34:55.854Z',
    })
    expect(result.collectionMethod).toBeUndefined()
  })

  it('reports a fixed amount as the one item', () => {
    const result = SubscriptionSchema.parse(
      transformSubscription({ ...DOC_SUBSCRIPTION, amount: 5000, amountMinLimit: undefined }),
    )
    expect(result.items).toEqual([{ id: '6633844090339328', amount: 5000 }])
  })

  it.each([
    ['created', 'incomplete'],
    ['active', 'active'],
    ['canceled', 'cancelled'],
    ['expired', 'expired'],
    ['failed', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    expect(
      SubscriptionSchema.parse(transformSubscription({ ...DOC_SUBSCRIPTION, status })).status,
    ).toBe(expected)
  })

  it('refuses a record without an id or a debtor taxId', () => {
    expect(() => transformSubscription({ ...DOC_SUBSCRIPTION, id: undefined })).toThrow(/no id/)
    expect(() => transformSubscription({ ...DOC_SUBSCRIPTION, taxId: undefined })).toThrow(
      /no taxId/,
    )
  })
})
