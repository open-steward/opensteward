import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type RawMiraklShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/mirakl/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeRaw(overrides: Partial<RawMiraklShipment> = {}): RawMiraklShipment {
  return {
    id: 'SHIP-001',
    order_id: 'MKL-0001',
    status: 'SHIPPED',
    tracking: {
      tracking_number: 'TRACK123',
      carrier_name: 'DHL',
      tracking_url: 'https://dhl.com/track/TRACK123',
      carrier_expected_delivery_date: {
        earliest: '2024-03-05T00:00:00Z',
        latest: '2024-03-07T00:00:00Z',
      },
    },
    shipment_lines: [{ order_line_id: 'LINE-1', offer_sku: 'SKU-A', quantity: 2 }],
    created_date: '2024-03-01T00:00:00Z',
    shipped_date: '2024-03-02T00:00:00Z',
    last_updated_date: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment (Mirakl)', () => {
  it('maps shipment id and orderId', () => {
    const result = transformShipment(makeRaw())
    expect(result.id).toBe('SHIP-001')
    expect(result.orderId).toBe('MKL-0001')
  })

  it('maps SHIPPED status to SUCCESS', () => {
    const result = transformShipment(makeRaw())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps RECEIVED status to SUCCESS', () => {
    const result = transformShipment(makeRaw({ status: 'RECEIVED' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps SHIPPING status to OPEN', () => {
    const result = transformShipment(makeRaw({ status: 'SHIPPING' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps CANCELED status to CANCELLED', () => {
    const result = transformShipment(makeRaw({ status: 'CANCELED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps tracking fields', () => {
    const result = transformShipment(makeRaw())
    expect(result.trackingNumber).toBe('TRACK123')
    expect(result.trackingUrl).toBe('https://dhl.com/track/TRACK123')
    expect(result.carrier).toBe('DHL')
  })

  it('maps earliest delivery date as estimatedDeliveryAt', () => {
    const result = transformShipment(makeRaw())
    expect(result.estimatedDeliveryAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('maps shipment_lines to lineItems', () => {
    const result = transformShipment(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('LINE-1')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('maps shippedAt from shipped_date', () => {
    const result = transformShipment(makeRaw())
    expect(result.shippedAt).toBe('2024-03-02T00:00:00.000Z')
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformShipment(makeRaw())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('handles missing tracking gracefully', () => {
    const result = transformShipment(makeRaw({ tracking: null }))
    expect(result.trackingNumber).toBeUndefined()
    expect(result.carrier).toBeUndefined()
  })
})
