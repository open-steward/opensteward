import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/bold-commerce/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

describe('transformFulfillment (bold-commerce)', () => {
  const raw: RawShopifyFulfillment = {
    id: 500,
    order_id: 1001,
    status: 'success',
    tracking_number: 'TRACK123',
    tracking_url: 'https://carrier.example.com/TRACK123',
    tracking_company: 'FedEx',
    service: 'standard',
    location_id: 7,
    line_items: [
      { id: 10, quantity: 2 },
      { id: 11, quantity: 1 },
    ],
    notify_customer: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    expect(transformFulfillment(raw).id).toBe('500')
  })

  it('maps orderId to string', () => {
    expect(transformFulfillment(raw).orderId).toBe('1001')
  })

  it('maps status success', () => {
    expect(transformFulfillment(raw).status).toBe('SUCCESS')
  })

  it('maps tracking number', () => {
    expect(transformFulfillment(raw).trackingNumber).toBe('TRACK123')
  })

  it('maps carrier from tracking_company', () => {
    expect(transformFulfillment(raw).carrier).toBe('FedEx')
  })

  it('maps line items with correct quantity', () => {
    const result = transformFulfillment(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]!.lineItemId).toBe('10')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('maps locationId to string', () => {
    expect(transformFulfillment(raw).locationId).toBe('7')
  })

  it('passes FulfillmentSchema validation', () => {
    expect(() => FulfillmentSchema.parse(transformFulfillment(raw))).not.toThrow()
  })

  it('maps CANCELLED status', () => {
    expect(transformFulfillment({ ...raw, status: 'cancelled' }).status).toBe('CANCELLED')
  })

  it('maps PENDING status', () => {
    expect(transformFulfillment({ ...raw, status: 'pending' }).status).toBe('PENDING')
  })

  it('handles null tracking_number', () => {
    const result = transformFulfillment({ ...raw, tracking_number: null })
    expect(result.trackingNumber).toBeUndefined()
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (bold-commerce)', () => {
  it('round-trips tracking number and carrier', () => {
    const canonical = transformFulfillment({
      id: 1,
      order_id: 2,
      tracking_number: 'ABC',
      tracking_company: 'UPS',
    })
    const body = untransformFulfillment(canonical)
    expect(body.tracking_number).toBe('ABC')
    expect(body.tracking_company).toBe('UPS')
  })
})
