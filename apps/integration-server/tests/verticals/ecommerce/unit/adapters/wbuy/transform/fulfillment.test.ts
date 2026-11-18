import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type RawWooCommerceFulfillmentOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/wbuy/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillmentOrder(
  overrides: Partial<RawWooCommerceFulfillmentOrder> = {},
): RawWooCommerceFulfillmentOrder {
  return {
    id: 99,
    status: 'completed',
    shipping_lines: [
      { id: 1, method_id: 'flat_rate', method_title: 'Flat Rate' },
    ],
    line_items: [{ id: 10, quantity: 1 }],
    date_modified_gmt: '2024-05-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformFulfillment (wbuy)', () => {
  it('synthesises a composite id from the order id', () => {
    const result = transformFulfillment(makeFulfillmentOrder())
    expect(result.id).toBe('ord:99')
    expect(result.orderId).toBe('99')
  })

  it('maps status, carrier, and service from shipping_lines', () => {
    const result = transformFulfillment(makeFulfillmentOrder())
    expect(result.status).toBe('SUCCESS')
    expect(result.carrier).toBe('flat_rate')
    expect(result.service).toBe('Flat Rate')
  })

  it('maps line items with lineItemId and quantity', () => {
    const result = transformFulfillment(makeFulfillmentOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.lineItemId).toBe('10')
    expect(li.quantity).toBe(1)
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeFulfillmentOrder()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw as unknown as Record<string, unknown>)
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('maps open status for processing orders', () => {
    const result = transformFulfillment(makeFulfillmentOrder({ status: 'processing' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps cancelled status for cancelled orders', () => {
    const result = transformFulfillment(makeFulfillmentOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })
})
