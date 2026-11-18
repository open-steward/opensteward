import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawSpreeShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/spree/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawSpreeShipment> = {}): RawSpreeShipment {
  return {
    id: 301,
    order_id: 500,
    number: 'H12345',
    state: 'shipped',
    tracking: '1Z999AA10123456784',
    shipped_at: '2024-02-21T10:00:00.000Z',
    cost: '5.00',
    stock_location_id: 1,
    inventory_units: [
      { id: 1, variant_id: 101, line_item_id: 1001, quantity: 2, state: 'shipped' },
      { id: 2, variant_id: 102, line_item_id: 1002, quantity: 1, state: 'shipped' },
    ],
    selected_shipping_rate: {
      id: 10,
      name: 'UPS Ground',
      cost: '5.00',
      selected: true,
    },
    created_at: '2024-02-20T14:30:00.000Z',
    updated_at: '2024-02-21T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformFulfillment (Spree)', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('301')
    expect(result.orderId).toBe('500')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrier).toBe('UPS Ground')
    expect(result.locationId).toBe('1')
    expect(result.shippedAt).toBe('2024-02-21T10:00:00.000Z')
  })

  it('maps status from state', () => {
    expect(transformFulfillment(makeShipment({ state: 'pending' })).status).toBe('PENDING')
    expect(transformFulfillment(makeShipment({ state: 'ready' })).status).toBe('OPEN')
    expect(transformFulfillment(makeShipment({ state: 'shipped' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeShipment({ state: 'canceled' })).status).toBe('CANCELLED')
  })

  it('groups inventory units into line items', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toEqual({ lineItemId: '1001', quantity: 2 })
    expect(result.lineItems![1]).toEqual({ lineItemId: '1002', quantity: 1 })
  })

  it('handles missing inventory units', () => {
    const result = transformFulfillment(makeShipment({ inventory_units: undefined }))
    expect(result.lineItems).toBeUndefined()
  })

  it('handles missing tracking', () => {
    const result = transformFulfillment(makeShipment({ tracking: null }))
    expect(result.trackingNumber).toBeUndefined()
  })

  it('preserves metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeShipment())
    const body = untransformFulfillment(canonical) as { shipment: Record<string, unknown> }
    expect(body.shipment['tracking']).toBe('1Z999AA10123456784')
    expect(body.shipment['stock_location_id']).toBe(1)
  })
})
