import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShoperDelivery,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoper/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeRaw(overrides: Partial<RawShoperDelivery> = {}): RawShoperDelivery {
  return {
    delivery_id: 601,
    order_id: 10011,
    waybill: 'WAY-9999',
    carrier: 'DPD',
    tracking_url: 'https://dpd.example.com/track/WAY-9999',
    status: 'sent',
    sent_date: '2024-03-10T12:00:00.000Z',
    delivery_date: '2024-03-12T15:00:00.000Z',
    add_date: '2024-03-09T08:00:00.000Z',
    edit_date: '2024-03-12T15:30:00.000Z',
    ...overrides,
  }
}

describe('shoper transformFulfillment', () => {
  it('maps delivery_id and order_id to strings', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.id).toBe('601')
    expect(result.orderId).toBe('10011')
  })

  it('maps sent status to SUCCESS', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps delivered status to SUCCESS', () => {
    const result = transformFulfillment(makeRaw({ status: 'delivered' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps pending status to PENDING', () => {
    const result = transformFulfillment(makeRaw({ status: 'pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps waybill to trackingNumber and carrier', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.trackingNumber).toBe('WAY-9999')
    expect(result.carrier).toBe('DPD')
    expect(result.trackingUrl).toBe('https://dpd.example.com/track/WAY-9999')
  })

  it('maps sent_date to shippedAt and delivery_date to deliveredAt', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.shippedAt).toBe('2024-03-10T12:00:00.000Z')
    expect(result.deliveredAt).toBe('2024-03-12T15:00:00.000Z')
  })

  it('produces output that passes FulfillmentSchema', () => {
    const result = transformFulfillment(makeRaw())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeRaw())
    const back = untransformFulfillment(canonical)
    expect(back.waybill).toBe('WAY-9999')
    expect(back.carrier).toBe('DPD')
  })
})
