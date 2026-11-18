import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type RawScapiShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/salesforce-commerce-cloud/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawScapiShipment> = {}): RawScapiShipment {
  return {
    shipmentId: 'shipment-1',
    orderNo: 'ORD-0001',
    shippingStatus: 'shipped',
    trackingNumber: 'TRK-123456',
    trackingUrl: 'https://tracking.example.com/TRK-123456',
    shippingMethod: { id: 'express', name: 'Express Delivery' },
    shippedDate: '2024-05-02T08:00:00Z',
    estimatedDeliveryDate: '2024-05-04T18:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('maps id and orderId from shipmentId/orderNo', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('shipment-1')
    expect(result.orderId).toBe('ORD-0001')
  })

  it('falls back orderId to the passed orderId parameter', () => {
    const result = transformFulfillment(makeShipment({ orderNo: undefined }), 'fallback-order')
    expect(result.orderId).toBe('fallback-order')
  })

  it('maps shippingStatus: shipped → SUCCESS', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps shippingStatus: not_shipped → PENDING', () => {
    const result = transformFulfillment(makeShipment({ shippingStatus: 'not_shipped' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps shippingStatus: part_shipped → OPEN', () => {
    const result = transformFulfillment(makeShipment({ shippingStatus: 'part_shipped' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps tracking number and url', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.trackingNumber).toBe('TRK-123456')
    expect(result.trackingUrl).toBe('https://tracking.example.com/TRK-123456')
  })

  it('maps service from shippingMethod id', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.service).toBe('express')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})
