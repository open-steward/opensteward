import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  transformFulfillments,
  type RawEtsyShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/etsy/transform/fulfillment'
import type { RawEtsyReceipt } from '../../../../../../../src/verticals/ecommerce/adapters/etsy/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeReceipt(overrides: Partial<RawEtsyReceipt> = {}): RawEtsyReceipt {
  return {
    receipt_id: 2345678901,
    is_paid: true,
    is_shipped: true,
    status: 'completed',
    transactions: [
      {
        transaction_id: 3001,
        listing_id: 1234567890,
        title: 'Handmade Ceramic Mug',
        quantity: 2,
        price: { amount: 1499, divisor: 100, currency_code: 'USD' },
      },
    ],
    shipments: [
      {
        receipt_shipping_id: 5001,
        carrier_name: 'USPS',
        tracking_code: '9400111899223100001234',
        tracking_url: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223100001234',
        shipment_notification_timestamp: 1714651200, // 2024-05-02T12:00:00Z
      },
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<RawEtsyShipment> = {}): RawEtsyShipment {
  return {
    receipt_shipping_id: 5001,
    carrier_name: 'USPS',
    tracking_code: '9400111899223100001234',
    tracking_url: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223100001234',
    shipment_notification_timestamp: 1714651200,
    ...overrides,
  }
}

describe('transformFulfillment (Etsy)', () => {
  it('builds a composite id from receipt_id and receipt_shipping_id', () => {
    const f = transformFulfillment(makeReceipt(), makeShipment(), 0)
    expect(f.id).toBe('2345678901:5001')
    expect(f.orderId).toBe('2345678901')
  })

  it('maps carrier and tracking info', () => {
    const f = transformFulfillment(makeReceipt(), makeShipment(), 0)
    expect(f.carrier).toBe('USPS')
    expect(f.trackingNumber).toBe('9400111899223100001234')
    expect(f.trackingUrl).toContain('usps.com')
    expect(f.status).toBe('SUCCESS')
  })

  it('converts shipment timestamp to ISO string', () => {
    const f = transformFulfillment(makeReceipt(), makeShipment(), 0)
    expect(f.shippedAt).toBe('2024-05-02T12:00:00.000Z')
  })

  it('includes line items from the receipt transactions', () => {
    const f = transformFulfillment(makeReceipt(), makeShipment(), 0)
    expect(f.lineItems).toHaveLength(1)
    expect(f.lineItems![0]).toMatchObject({
      lineItemId: '3001',
      quantity: 2,
    })
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const f = transformFulfillment(makeReceipt(), makeShipment(), 0)
    expect(() => FulfillmentSchema.parse(f)).not.toThrow()
  })
})

describe('transformFulfillments (Etsy)', () => {
  it('transforms each shipment into a fulfillment', () => {
    const receipt = makeReceipt({
      shipments: [
        makeShipment({ receipt_shipping_id: 5001 }),
        makeShipment({ receipt_shipping_id: 5002, carrier_name: 'FedEx' }),
      ],
    })
    const list = transformFulfillments(receipt)
    expect(list).toHaveLength(2)
    expect(list[0]!.id).toBe('2345678901:5001')
    expect(list[1]!.id).toBe('2345678901:5002')
    expect(list[1]!.carrier).toBe('FedEx')
  })

  it('projects a PENDING fulfillment when no shipments exist', () => {
    const receipt = makeReceipt({ shipments: [], is_shipped: false, status: 'paid' })
    const list = transformFulfillments(receipt)
    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe('2345678901:pending')
    expect(list[0]!.status).toBe('PENDING')
    expect(list[0]!.lineItems).toHaveLength(1)
  })

  it('each fulfillment satisfies FulfillmentSchema', () => {
    const list = transformFulfillments(makeReceipt())
    for (const f of list) {
      expect(() => FulfillmentSchema.parse(f)).not.toThrow()
    }
  })
})
