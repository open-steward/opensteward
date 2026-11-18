import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawBumpaFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/bumpa/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

describe('transformFulfillment (bumpa)', () => {
  const raw: RawBumpaFulfillment = {
    id: 400,
    order_id: 2000,
    status: 'shipped',
    tracking_number: 'BMP-TRK-001',
    tracking_url: 'https://track.bumpa.shop/BMP-TRK-001',
    carrier: 'GIG Logistics',
    service: 'express',
    location_id: 99,
    line_items: [
      { id: 30, quantity: 2 },
      { order_item_id: 31, quantity: 1 },
    ],
    notify_customer: true,
    shipped_at: '2024-03-01T00:00:00Z',
    delivered_at: null,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    expect(transformFulfillment(raw).id).toBe('400')
  })

  it('maps orderId to string', () => {
    expect(transformFulfillment(raw).orderId).toBe('2000')
  })

  it('maps status shipped → SUCCESS', () => {
    expect(transformFulfillment(raw).status).toBe('SUCCESS')
  })

  it('maps tracking number', () => {
    expect(transformFulfillment(raw).trackingNumber).toBe('BMP-TRK-001')
  })

  it('maps carrier', () => {
    expect(transformFulfillment(raw).carrier).toBe('GIG Logistics')
  })

  it('maps line items by id field', () => {
    const result = transformFulfillment(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]!.lineItemId).toBe('30')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('maps locationId to string', () => {
    expect(transformFulfillment(raw).locationId).toBe('99')
  })

  it('maps shippedAt', () => {
    expect(transformFulfillment(raw).shippedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('maps PENDING status', () => {
    expect(transformFulfillment({ ...raw, status: 'pending' }).status).toBe('PENDING')
  })

  it('maps CANCELLED status', () => {
    expect(transformFulfillment({ ...raw, status: 'cancelled' }).status).toBe('CANCELLED')
  })

  it('maps FAILURE status', () => {
    expect(transformFulfillment({ ...raw, status: 'failed' }).status).toBe('FAILURE')
  })

  it('uses courier as fallback for carrier', () => {
    const result = transformFulfillment({ ...raw, carrier: null, courier: 'DHL' })
    expect(result.carrier).toBe('DHL')
  })

  it('passes FulfillmentSchema validation', () => {
    expect(() => FulfillmentSchema.parse(transformFulfillment(raw))).not.toThrow()
  })
})

describe('untransformFulfillment (bumpa)', () => {
  it('round-trips tracking and carrier', () => {
    const canonical = transformFulfillment({
      id: 1,
      order_id: 2,
      tracking_number: 'T999',
      carrier: 'DHL',
    })
    const body = untransformFulfillment(canonical)
    expect(body.tracking_number).toBe('T999')
    expect(body.carrier).toBe('DHL')
  })
})
