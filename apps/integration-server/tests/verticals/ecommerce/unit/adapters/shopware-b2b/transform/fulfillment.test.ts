import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopwareOrderDelivery,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware-b2b/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeDelivery(overrides: Partial<RawShopwareOrderDelivery> = {}): RawShopwareOrderDelivery {
  return {
    id: 'del-b2b-001',
    orderId: 'order-b2b-001',
    trackingCodes: ['DHL-B2B-789456'],
    shippingMethod: { name: 'DHL Freight', id: 'sm-1' },
    stateMachineState: { technicalName: 'shipped', name: 'Shipped' },
    positions: [
      { id: 'pos-1', orderLineItemId: 'li-1', quantity: 100 },
    ],
    createdAt: '2024-05-02T08:00:00+00:00',
    updatedAt: '2024-05-02T10:00:00+00:00',
    ...overrides,
  }
}

describe('transformFulfillment (Shopware B2B)', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeDelivery())
    expect(result.id).toBe('del-b2b-001')
    expect(result.orderId).toBe('order-b2b-001')
    expect(result.trackingNumber).toBe('DHL-B2B-789456')
    expect(result.carrier).toBe('DHL Freight')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeDelivery())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('li-1')
    expect(result.lineItems![0]!.quantity).toBe(100)
  })

  it('covers status mappings', () => {
    const cases: Array<[string, string]> = [
      ['open', 'PENDING'],
      ['shipped', 'SUCCESS'],
      ['shipped_partially', 'OPEN'],
      ['returned', 'CANCELLED'],
      ['cancelled', 'CANCELLED'],
    ]
    for (const [state, expected] of cases) {
      const r = transformFulfillment(
        makeDelivery({ stateMachineState: { technicalName: state } }),
      )
      expect(r.status).toBe(expected)
    }
  })

  it('preserves metadata and validates', () => {
    const raw = makeDelivery()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (Shopware B2B)', () => {
  it('maps tracking number to trackingCodes array', () => {
    const body = untransformFulfillment({ trackingNumber: 'DHL-123' })
    expect(body['trackingCodes']).toEqual(['DHL-123'])
  })

  it('returns empty array when no tracking', () => {
    const body = untransformFulfillment({})
    expect(body['trackingCodes']).toEqual([])
  })
})
