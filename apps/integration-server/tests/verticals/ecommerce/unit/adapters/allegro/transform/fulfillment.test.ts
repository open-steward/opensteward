import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  transformFulfillments,
  untransformFulfillment,
  type RawAllegroShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/allegro/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawAllegroShipment> = {}): RawAllegroShipment {
  return {
    id: 'ship-001',
    waybill: {
      id: 'WB-123456789',
      carrierName: 'InPost',
      carrierId: 'inpost',
    },
    lineItems: [{ id: 'li-001' }, { id: 'li-002' }],
    createdAt: '2024-05-02T14:30:00.000Z',
    ...overrides,
  }
}

describe('transformFulfillment (Allegro)', () => {
  it('maps core fields from shipment', () => {
    const result = transformFulfillment('order-001', makeShipment())
    expect(result.id).toBe('ship-001')
    expect(result.orderId).toBe('order-001')
    expect(result.trackingNumber).toBe('WB-123456789')
    expect(result.carrier).toBe('InPost')
  })

  it('infers SUCCESS status when waybill is present', () => {
    const result = transformFulfillment('order-001', makeShipment())
    expect(result.status).toBe('SUCCESS')
  })

  it('infers PENDING status when waybill is absent', () => {
    const result = transformFulfillment(
      'order-001',
      makeShipment({ waybill: undefined }),
    )
    expect(result.status).toBe('PENDING')
  })

  it('maps line items with quantity 1', () => {
    const result = transformFulfillment('order-001', makeShipment())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toEqual({ lineItemId: 'li-001', quantity: 1 })
    expect(result.lineItems![1]).toEqual({ lineItemId: 'li-002', quantity: 1 })
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment('order-001', makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment('order-001', raw)
    expect(result.metadata).toBe(raw)
  })
})

describe('transformFulfillments (Allegro)', () => {
  it('returns empty array for undefined or empty input', () => {
    expect(transformFulfillments('order-001', undefined)).toEqual([])
    expect(transformFulfillments('order-001', [])).toEqual([])
  })

  it('maps multiple shipments', () => {
    const items = [makeShipment(), makeShipment({ id: 'ship-002' })]
    const results = transformFulfillments('order-001', items)
    expect(results).toHaveLength(2)
    expect(results[0]!.id).toBe('ship-001')
    expect(results[1]!.id).toBe('ship-002')
  })
})

describe('untransformFulfillment (Allegro)', () => {
  it('maps canonical fields to Allegro body', () => {
    const body = untransformFulfillment({
      orderId: 'order-001',
      trackingNumber: 'WB-999',
      carrier: 'DPD',
      lineItems: [{ lineItemId: 'li-001', quantity: 1 }],
    })
    expect(body['checkoutFormId']).toBe('order-001')
    expect(body['waybill']).toEqual({ id: 'WB-999', carrierName: 'DPD' })
    expect(body['lineItems']).toEqual([{ id: 'li-001' }])
  })

  it('omits waybill when tracking info is absent', () => {
    const body = untransformFulfillment({ orderId: 'order-001' })
    expect(body['waybill']).toBeUndefined()
  })
})
