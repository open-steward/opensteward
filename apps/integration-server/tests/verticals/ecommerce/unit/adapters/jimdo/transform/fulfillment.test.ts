import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/jimdo/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

describe('transformFulfillment (jimdo)', () => {
  const raw: RawShopifyFulfillment = {
    id: 111,
    order_id: 222,
    status: 'success',
    tracking_number: '1Z999AA10123456784',
    tracking_url: 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
    tracking_company: 'UPS',
    service: 'Ground',
    location_id: 333,
    line_items: [
      { id: 10, quantity: 2 },
      { id: 11, quantity: 1 },
    ],
    notify_customer: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformFulfillment(raw)
    expect(result.id).toBe('111')
  })

  it('maps orderId to string', () => {
    const result = transformFulfillment(raw)
    expect(result.orderId).toBe('222')
  })

  it('maps status success → SUCCESS', () => {
    const result = transformFulfillment(raw)
    expect(result.status).toBe('SUCCESS')
  })

  it('maps tracking fields', () => {
    const result = transformFulfillment(raw)
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.trackingUrl).toBe('https://www.ups.com/track?tracknum=1Z999AA10123456784')
    expect(result.carrier).toBe('UPS')
    expect(result.service).toBe('Ground')
  })

  it('maps locationId to string', () => {
    const result = transformFulfillment(raw)
    expect(result.locationId).toBe('333')
  })

  it('maps lineItems with string ids', () => {
    const result = transformFulfillment(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toEqual({ lineItemId: '10', quantity: 2 })
    expect(result.lineItems![1]).toEqual({ lineItemId: '11', quantity: 1 })
  })

  it('produces schema-valid output', () => {
    const result = transformFulfillment(raw)
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('maps cancelled status (alias canceled)', () => {
    const result = transformFulfillment({ ...raw, status: 'canceled' })
    expect(result.status).toBe('CANCELLED')
  })

  it('round-trips via untransformFulfillment', () => {
    const result = transformFulfillment(raw)
    const back = untransformFulfillment(result)
    expect(back.tracking_number).toBe(raw.tracking_number)
    expect(back.tracking_company).toBe(raw.tracking_company)
    expect(back.notify_customer).toBe(true)
  })
})
