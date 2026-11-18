import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type RawSapConsignment,
} from '../../../../../../../src/verticals/ecommerce/adapters/sap-commerce/transform/fulfillment'
import type { RawSapOrder } from '../../../../../../../src/verticals/ecommerce/adapters/sap-commerce/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeOrder(overrides: Partial<RawSapOrder> = {}): RawSapOrder {
  return {
    code: 'ORD-10001',
    statusDisplay: 'processing',
    deliveryStatus: 'SHIPPED',
    entries: [
      { entryNumber: 0, product: { code: 'HW-1234' }, quantity: 2 },
    ],
    created: '2024-06-01T10:00:00.000Z',
    statusDate: '2024-06-02T14:00:00.000Z',
    ...overrides,
  }
}

function makeConsignment(): RawSapConsignment {
  return {
    code: 'CON-0001',
    status: 'SHIPPED',
    statusDate: '2024-06-02T14:00:00.000Z',
    trackingID: 'DHL-123456',
    carrier: 'DHL',
    entries: [
      { orderEntry: { entryNumber: 0 }, quantity: 2, shippedQuantity: 2 },
    ],
  }
}

describe('transformFulfillment (sap-commerce)', () => {
  it('maps from order without consignment', () => {
    const r = transformFulfillment(makeOrder())
    expect(r.id).toBe('ORD-10001')
    expect(r.orderId).toBe('ORD-10001')
    expect(r.status).toBe('SUCCESS')
  })

  it('maps fulfillment status from delivery status', () => {
    expect(transformFulfillment(makeOrder({ deliveryStatus: 'PENDING' })).status).toBe('PENDING')
    expect(transformFulfillment(makeOrder({ deliveryStatus: 'SHIPPED' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeOrder({ deliveryStatus: undefined, statusDisplay: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps line items from order entries', () => {
    const r = transformFulfillment(makeOrder())
    expect(r.lineItems).toHaveLength(1)
    expect(r.lineItems![0]!.lineItemId).toBe('0')
    expect(r.lineItems![0]!.quantity).toBe(2)
  })

  it('maps from consignment when provided', () => {
    const r = transformFulfillment(makeOrder(), makeConsignment())
    expect(r.id).toBe('CON-0001')
    expect(r.trackingNumber).toBe('DHL-123456')
    expect(r.carrier).toBe('DHL')
    expect(r.status).toBe('SUCCESS')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const r = transformFulfillment(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const r = transformFulfillment(makeOrder())
    expect(() => FulfillmentSchema.parse(r)).not.toThrow()
  })
})
