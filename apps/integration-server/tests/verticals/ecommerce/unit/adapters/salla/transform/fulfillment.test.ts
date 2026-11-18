import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type RawSallaShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/salla/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawSallaShipment> = {}): RawSallaShipment {
  return {
    id: 900,
    order_id: 8001,
    type: 'normal',
    status: 'shipped',
    tracking_number: 'DHL-0012345',
    tracking_url: 'https://tracking.dhl.com/DHL-0012345',
    courier_name: 'DHL',
    packages: [
      { item_id: 401, sku: 'TEA-JAS-100G', quantity: 2 },
    ],
    created_at: '2024-05-02T08:00:00Z',
    updated_at: '2024-05-03T10:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('maps id and orderId', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('900')
    expect(result.orderId).toBe('8001')
  })

  it('maps status: shipped → SUCCESS', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status: pending → PENDING', () => {
    const result = transformFulfillment(makeShipment({ status: 'pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps status: cancelled → CANCELLED', () => {
    const result = transformFulfillment(makeShipment({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps tracking number and url', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.trackingNumber).toBe('DHL-0012345')
    expect(result.trackingUrl).toBe('https://tracking.dhl.com/DHL-0012345')
  })

  it('maps carrier from courier_name', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.carrier).toBe('DHL')
  })

  it('maps packages to lineItems', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('401')
    expect(result.lineItems![0]!.quantity).toBe(2)
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
