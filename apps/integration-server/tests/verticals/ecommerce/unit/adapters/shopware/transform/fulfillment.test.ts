import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopwareOrderDelivery,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeDelivery(
  overrides: Partial<RawShopwareOrderDelivery> = {},
): RawShopwareOrderDelivery {
  return {
    id: 'del-abc123',
    orderId: 'order-001',
    trackingCodes: ['DHL-123456', 'DHL-654321'],
    shippingMethod: { name: 'DHL Standard', id: 'sm-1' },
    stateMachineState: { technicalName: 'shipped', name: 'Shipped' },
    positions: [
      { id: 'pos-1', orderLineItemId: 'li-1', quantity: 2 },
      { id: 'pos-2', orderLineItemId: 'li-2', quantity: 1 },
    ],
    createdAt: '2024-05-02T08:00:00+00:00',
    updatedAt: '2024-05-02T10:00:00+00:00',
    ...overrides,
  }
}

describe('transformFulfillment (Shopware)', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeDelivery())
    expect(result.id).toBe('del-abc123')
    expect(result.orderId).toBe('order-001')
    expect(result.status).toBe('SUCCESS')
    expect(result.trackingNumber).toBe('DHL-123456')
    expect(result.carrier).toBe('DHL Standard')
  })

  it('maps line items from positions', () => {
    const result = transformFulfillment(makeDelivery())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toEqual({ lineItemId: 'li-1', quantity: 2 })
    expect(result.lineItems![1]).toEqual({ lineItemId: 'li-2', quantity: 1 })
  })

  it('covers delivery state mappings', () => {
    const cases: Array<[string, string]> = [
      ['open', 'PENDING'],
      ['shipped', 'SUCCESS'],
      ['shipped_partially', 'OPEN'],
      ['returned', 'CANCELLED'],
      ['cancelled', 'CANCELLED'],
    ]
    for (const [state, expected] of cases) {
      const r = transformFulfillment(
        makeDelivery({
          stateMachineState: { technicalName: state },
        }),
      )
      expect(r.status).toBe(expected)
    }
  })

  it('handles missing tracking codes', () => {
    const result = transformFulfillment(makeDelivery({ trackingCodes: [] }))
    expect(result.trackingNumber).toBeUndefined()
  })

  it('handles missing positions', () => {
    const result = transformFulfillment(makeDelivery({ positions: undefined }))
    expect(result.lineItems).toBeUndefined()
  })

  it('preserves raw payload in metadata and validates', () => {
    const raw = makeDelivery()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (Shopware)', () => {
  it('maps tracking number to trackingCodes array', () => {
    const body = untransformFulfillment({ trackingNumber: 'DHL-999' })
    expect(body['trackingCodes']).toEqual(['DHL-999'])
  })

  it('returns empty array when no tracking number', () => {
    const body = untransformFulfillment({})
    expect(body['trackingCodes']).toEqual([])
  })
})
