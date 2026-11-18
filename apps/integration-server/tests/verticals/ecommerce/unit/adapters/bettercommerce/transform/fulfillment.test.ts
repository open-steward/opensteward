import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawBCShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/bettercommerce/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawBCShipment> = {}): RawBCShipment {
  return {
    shipmentId: 'ship-001',
    orderId: 'order-001',
    status: 'dispatched',
    trackingNo: '1Z999AA10123456784',
    trackingUrl: 'https://tracking.example.com/1Z999',
    carrier: 'DHL',
    locationId: 'loc-001',
    items: [{ lineItemId: 'li-001', qty: 2 }],
    notifyCustomer: true,
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (BetterCommerce)', () => {
  it('maps shipmentId to id', () => {
    const result = transformFulfillment(makeShipment({ shipmentId: 'ship-001' }))
    expect(result.id).toBe('ship-001')
  })

  it('falls back to recordId', () => {
    const result = transformFulfillment(
      makeShipment({ shipmentId: undefined, recordId: 'rec-abc' }),
    )
    expect(result.id).toBe('rec-abc')
  })

  it('maps orderId', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.orderId).toBe('order-001')
  })

  it('maps status=dispatched to SUCCESS', () => {
    const result = transformFulfillment(makeShipment({ status: 'dispatched' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status=shipped to SUCCESS', () => {
    const result = transformFulfillment(makeShipment({ status: 'shipped' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status=pending to PENDING', () => {
    const result = transformFulfillment(makeShipment({ status: 'pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps status=cancelled to CANCELLED', () => {
    const result = transformFulfillment(makeShipment({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps trackingNo to trackingNumber', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
  })

  it('falls back to trackingNumber field', () => {
    const result = transformFulfillment(
      makeShipment({ trackingNo: undefined, trackingNumber: '9876' }),
    )
    expect(result.trackingNumber).toBe('9876')
  })

  it('maps carrier', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.carrier).toBe('DHL')
  })

  it('falls back to courierName', () => {
    const result = transformFulfillment(makeShipment({ carrier: undefined, courierName: 'FedEx' }))
    expect(result.carrier).toBe('FedEx')
  })

  it('maps locationId', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.locationId).toBe('loc-001')
  })

  it('maps items to lineItems', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('li-001')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('falls back to lineItems field when items is absent', () => {
    const result = transformFulfillment(
      makeShipment({ items: undefined, lineItems: [{ lineItemId: 'li-002', qty: 1 }] }),
    )
    expect(result.lineItems![0]!.lineItemId).toBe('li-002')
  })

  it('maps notifyCustomer', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.notifyCustomer).toBe(true)
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-02T00:00:00Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (BetterCommerce)', () => {
  it('maps trackingNumber to trackingNo', () => {
    const body = untransformFulfillment({ trackingNumber: '12345' })
    expect(body.trackingNo).toBe('12345')
  })

  it('maps carrier', () => {
    const body = untransformFulfillment({ carrier: 'DHL' })
    expect(body.carrier).toBe('DHL')
  })

  it('maps lineItems to items with qty', () => {
    const body = untransformFulfillment({
      lineItems: [{ lineItemId: 'li-001', quantity: 3 }],
    })
    const items = body.items as Array<Record<string, unknown>>
    expect(items[0]!.lineItemId).toBe('li-001')
    expect(items[0]!.qty).toBe(3)
  })
})
