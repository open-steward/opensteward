import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/sellfy/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawShopifyFulfillment> = {}): RawShopifyFulfillment {
  return {
    id: 5001,
    order_id: 1001,
    status: 'success',
    tracking_number: 'TRACK123456',
    tracking_url: 'https://track.example.com/TRACK123456',
    tracking_company: 'DHL',
    service: 'standard',
    location_id: 999,
    line_items: [{ id: 2001, quantity: 1 }],
    notify_customer: true,
    shipment_status: null,
    created_at: '2024-05-02T10:00:00Z',
    updated_at: '2024-05-02T10:30:00Z',
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.id).toBe('5001')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
  })

  it('maps status success to SUCCESS', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps tracking_number and tracking_company to trackingNumber and carrier', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.trackingNumber).toBe('TRACK123456')
    expect(result.carrier).toBe('DHL')
  })

  it('maps trackingUrl', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.trackingUrl).toBe('https://track.example.com/TRACK123456')
  })

  it('maps service and locationId', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.service).toBe('standard')
    expect(result.locationId).toBe('999')
  })

  it('maps line_items to lineItems with stringified ids', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('2001')
    expect(result.lineItems![0]!.quantity).toBe(1)
  })

  it('maps notifyCustomer', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.notifyCustomer).toBe(true)
  })

  it('maps status cancelled (accepts "canceled" alias)', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'canceled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps status cancelled (canonical spelling)', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps dates', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.createdAt).toBe('2024-05-02T10:00:00Z')
    expect(result.updatedAt).toBe('2024-05-02T10:30:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeFulfillment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeFulfillment())
    const raw = untransformFulfillment(canonical)
    expect(raw.tracking_number).toBe('TRACK123456')
    expect(raw.tracking_company).toBe('DHL')
    expect(raw.location_id).toBe('999')
    expect(raw.notify_customer).toBe(true)
  })
})
