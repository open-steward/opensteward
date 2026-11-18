import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type RawYokartShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/yokart/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawYokartShipment> = {}): RawYokartShipment {
  return {
    shipment_id: 500,
    order_id: 1042,
    shipment_status: '1',
    tracking_number: 'TRACK123',
    carrier_name: 'FedEx',
    shipping_service: 'Ground',
    shipment_date: '2024-05-02T08:00:00Z',
    estimated_delivery_date: '2024-05-05T18:00:00Z',
    actual_delivery_date: null,
    products: [{ op_id: 9001, quantity: 2 }],
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('500')
    expect(result.orderId).toBe('1042')
    expect(result.trackingNumber).toBe('TRACK123')
    expect(result.carrier).toBe('FedEx')
    expect(result.service).toBe('Ground')
  })

  it('uses orderId param when provided (overrides raw.order_id)', () => {
    const result = transformFulfillment(makeShipment({ order_id: undefined }), 'ord-999')
    expect(result.orderId).toBe('ord-999')
  })

  it('maps numeric status "0" to PENDING', () => {
    const result = transformFulfillment(makeShipment({ shipment_status: '0' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps numeric status "1" / label "shipped" to OPEN', () => {
    expect(transformFulfillment(makeShipment({ shipment_status: '1' })).status).toBe('OPEN')
    expect(transformFulfillment(makeShipment({ shipment_status: 'shipped' })).status).toBe('OPEN')
  })

  it('maps numeric status "2" / label "delivered" to SUCCESS', () => {
    expect(transformFulfillment(makeShipment({ shipment_status: '2' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeShipment({ shipment_status: 'delivered' })).status).toBe(
      'SUCCESS',
    )
  })

  it('maps numeric status "3" / label "cancelled" to CANCELLED', () => {
    expect(transformFulfillment(makeShipment({ shipment_status: '3' })).status).toBe('CANCELLED')
    expect(transformFulfillment(makeShipment({ shipment_status: 'cancelled' })).status).toBe(
      'CANCELLED',
    )
    expect(transformFulfillment(makeShipment({ shipment_status: 'canceled' })).status).toBe(
      'CANCELLED',
    )
  })

  it('maps label "failed" to FAILURE', () => {
    expect(transformFulfillment(makeShipment({ shipment_status: 'failed' })).status).toBe('FAILURE')
  })

  it('maps line items from products array', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('9001')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('defaults quantity to 1 when missing', () => {
    const result = transformFulfillment(makeShipment({ products: [{ op_id: 100 }] }))
    expect(result.lineItems![0]!.quantity).toBe(1)
  })

  it('maps shippedAt and estimatedDeliveryAt', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.shippedAt).toBeTruthy()
    expect(result.estimatedDeliveryAt).toBeTruthy()
    expect(result.deliveredAt).toBeUndefined()
  })

  it('maps actual_delivery_date to deliveredAt', () => {
    const result = transformFulfillment(
      makeShipment({ actual_delivery_date: '2024-05-04T14:00:00Z' }),
    )
    expect(result.deliveredAt).toBeTruthy()
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})
