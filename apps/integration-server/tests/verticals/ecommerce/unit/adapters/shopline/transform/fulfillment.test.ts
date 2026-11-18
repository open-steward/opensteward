import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShoplineFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopline/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeRaw(overrides: Partial<RawShoplineFulfillment> = {}): RawShoplineFulfillment {
  return {
    id: 8001,
    order_id: 1001,
    name: '#1001.1',
    status: 'success',
    tracking_info_list: [
      {
        tracking_company: 'UPS',
        tracking_number: '1Z999AA10123456784',
        tracking_url: 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
      },
    ],
    service: 'Ground',
    location_id: 222,
    line_items: [{ id: 9001, quantity: 2 }],
    notify_customer: true,
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-01-15T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('maps id and orderId', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.id).toBe('8001')
    expect(result.orderId).toBe('1001')
  })

  it('maps status to canonical enum', () => {
    expect(transformFulfillment(makeRaw({ status: 'success' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeRaw({ status: 'pending' })).status).toBe('PENDING')
    expect(transformFulfillment(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
    expect(transformFulfillment(makeRaw({ status: 'canceled' })).status).toBe('CANCELLED')
  })

  it('extracts tracking info from tracking_info_list first entry', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.carrier).toBe('UPS')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.trackingUrl).toBe('https://www.ups.com/track?tracknum=1Z999AA10123456784')
  })

  it('falls back to deprecated scalar tracking fields', () => {
    const result = transformFulfillment(
      makeRaw({
        tracking_info_list: undefined,
        tracking_company: 'FedEx',
        tracking_number: 'FEDEX123',
        tracking_url: 'https://fedex.com/track?num=FEDEX123',
      }),
    )
    expect(result.carrier).toBe('FedEx')
    expect(result.trackingNumber).toBe('FEDEX123')
  })

  it('maps locationId, service, and notifyCustomer', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.locationId).toBe('222')
    expect(result.service).toBe('Ground')
    expect(result.notifyCustomer).toBe(true)
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('9001')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('maps timestamps', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-01-15T12:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRaw()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeRaw())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips tracking via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeRaw())
    const body = untransformFulfillment(canonical)
    const trackingList = body.tracking_info_list as Record<string, unknown>[]
    expect(trackingList[0]!.tracking_company).toBe('UPS')
    expect(trackingList[0]!.tracking_number).toBe('1Z999AA10123456784')
    expect(body.notify_customer).toBe(true)
  })
})
