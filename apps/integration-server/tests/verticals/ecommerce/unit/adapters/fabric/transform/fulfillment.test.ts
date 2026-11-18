import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawFabricFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/fabric/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawFabricFulfillment> = {}): RawFabricFulfillment {
  return {
    id: 'ful-001',
    order_id: 'ord-001',
    status: 'success',
    tracking_number: '1Z999AA10123456784',
    tracking_url: 'https://track.fabric.inc/1Z999',
    carrier: 'UPS',
    service: 'Ground',
    location_id: 'loc-001',
    shipment_id: 'ship-001',
    line_items: [
      { line_item_id: 'li-001', quantity: 2 },
    ],
    notify_customer: true,
    shipped_at: '2024-07-02T08:00:00Z',
    estimated_delivery_at: '2024-07-05T17:00:00Z',
    delivered_at: '2024-07-04T14:00:00Z',
    created_at: '2024-07-02T07:00:00Z',
    updated_at: '2024-07-04T14:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (fabric)', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.id).toBe('ful-001')
    expect(result.orderId).toBe('ord-001')
    expect(result.status).toBe('SUCCESS')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrier).toBe('UPS')
    expect(result.service).toBe('Ground')
    expect(result.locationId).toBe('loc-001')
  })

  it('maps status values', () => {
    expect(transformFulfillment(makeFulfillment({ status: 'pending' })).status).toBe('PENDING')
    expect(transformFulfillment(makeFulfillment({ status: 'open' })).status).toBe('OPEN')
    expect(transformFulfillment(makeFulfillment({ status: 'cancelled' })).status).toBe('CANCELLED')
    expect(transformFulfillment(makeFulfillment({ status: 'error' })).status).toBe('ERROR')
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toEqual({ lineItemId: 'li-001', quantity: 2 })
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeFulfillment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (fabric)', () => {
  it('round-trips writable fields', () => {
    const body = untransformFulfillment({
      trackingNumber: '1Z999',
      carrier: 'FedEx',
      notifyCustomer: true,
      lineItems: [{ lineItemId: 'li-001', quantity: 1 }],
    }) as Record<string, unknown>
    expect(body['tracking_number']).toBe('1Z999')
    expect(body['carrier']).toBe('FedEx')
    expect(body['notify_customer']).toBe(true)
    expect((body['line_items'] as Array<Record<string, unknown>>)[0]!['line_item_id']).toBe('li-001')
  })
})
