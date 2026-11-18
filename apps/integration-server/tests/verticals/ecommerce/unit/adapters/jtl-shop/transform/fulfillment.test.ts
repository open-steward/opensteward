import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawJtlShopFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/jtl-shop/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

describe('transformFulfillment (jtl-shop)', () => {
  const raw: RawJtlShopFulfillment = {
    id: 55,
    orderId: 1001,
    status: 'shipped',
    trackingNumber: 'DE123456789DE',
    trackingUrl:
      'https://www.dhl.de/de/privatkunden/pakete-empfangen/tracking.html?piececode=DE123456789DE',
    carrier: 'DHL',
    service: 'Standard',
    items: [
      { lineItemId: 10, quantity: 2 },
      { lineItemId: 11, quantity: 1 },
    ],
    notifyCustomer: true,
    shippedAt: '2024-03-01T00:00:00Z',
    estimatedDeliveryAt: '2024-03-05T00:00:00Z',
    created: '2024-03-01T00:00:00Z',
    modified: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformFulfillment(raw)
    expect(result.id).toBe('55')
  })

  it('maps orderId to string', () => {
    const result = transformFulfillment(raw)
    expect(result.orderId).toBe('1001')
  })

  it('maps status shipped → SUCCESS', () => {
    const result = transformFulfillment(raw)
    expect(result.status).toBe('SUCCESS')
  })

  it('maps delivered → SUCCESS', () => {
    const result = transformFulfillment({ ...raw, status: 'delivered' })
    expect(result.status).toBe('SUCCESS')
  })

  it('maps tracking fields', () => {
    const result = transformFulfillment(raw)
    expect(result.trackingNumber).toBe('DE123456789DE')
    expect(result.carrier).toBe('DHL')
    expect(result.service).toBe('Standard')
  })

  it('maps lineItems with string ids', () => {
    const result = transformFulfillment(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]!.lineItemId).toBe('10')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('maps shippedAt and estimatedDeliveryAt', () => {
    const result = transformFulfillment(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00Z')
    expect(result.estimatedDeliveryAt).toBe('2024-03-05T00:00:00Z')
  })

  it('maps createdAt from created', () => {
    const result = transformFulfillment(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('produces schema-valid output', () => {
    const result = transformFulfillment(raw)
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const result = transformFulfillment(raw)
    const back = untransformFulfillment(result)
    expect(back.trackingNumber).toBe(raw.trackingNumber)
    expect(back.carrier).toBe(raw.carrier)
    expect(back.notifyCustomer).toBe(true)
  })
})
