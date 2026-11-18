/**
 * Docs: https://developers.orderchamp.com/manage-orders-fulfilment
 */
import { describe, it, expect } from 'vitest'
import {
  untransformFulfillment,
  transformFulfillment,
  untransformShipmentShipped,
} from '../../../../../../../src/verticals/ecommerce/adapters/orderchamp/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

describe('untransformFulfillment (Orderchamp shipmentCreate input)', () => {
  it('maps orderId + lineItems to orderProductId/quantity', () => {
    const input = untransformFulfillment({
      orderId: 'order-1',
      lineItems: [{ lineItemId: 'orderproduct-1', quantity: 2 }],
    })
    expect(input).toEqual({ orderId: 'order-1', products: [{ orderProductId: 'orderproduct-1', quantity: 2 }] })
  })

  it('throws without orderId', () => {
    expect(() => untransformFulfillment({ lineItems: [{ lineItemId: 'li1', quantity: 1 }] })).toThrow(
      /requires orderId/,
    )
  })

  it('throws without at least one lineItems entry', () => {
    expect(() => untransformFulfillment({ orderId: 'o1', lineItems: [] })).toThrow(/at least one lineItems/)
  })
})

describe('transformFulfillment (Orderchamp shipmentCreate response)', () => {
  it('combines the response id with the request that produced it', () => {
    const request = untransformFulfillment({
      orderId: 'order-1',
      lineItems: [{ lineItemId: 'orderproduct-1', quantity: 2 }],
    })
    const result = transformFulfillment({ id: 'shipment-1' }, request)
    expect(result.id).toBe('shipment-1')
    expect(result.orderId).toBe('order-1')
    expect(result.lineItems).toEqual([{ lineItemId: 'orderproduct-1', quantity: 2 }])
  })

  it('produces schema-valid output', () => {
    const request = untransformFulfillment({ orderId: 'o1', lineItems: [{ lineItemId: 'li1', quantity: 1 }] })
    expect(() => FulfillmentSchema.parse(transformFulfillment({ id: 's1' }, request))).not.toThrow()
  })
})

describe('untransformShipmentShipped', () => {
  it('sets isTracked true and includes trackingNumber when one is supplied', () => {
    const input = untransformShipmentShipped('shipment-1', { trackingNumber: 'TRACK123' })
    expect(input).toEqual({ shipmentId: 'shipment-1', isTracked: true, trackingNumber: 'TRACK123' })
  })

  it('sets isTracked false and omits trackingNumber when none is supplied', () => {
    const input = untransformShipmentShipped('shipment-1', {})
    expect(input).toEqual({ shipmentId: 'shipment-1', isTracked: false })
  })
})
