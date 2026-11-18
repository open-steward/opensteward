import { describe, it, expect } from 'vitest'
import { transformFulfillment } from '../../../../../../../src/verticals/ecommerce/adapters/wildberries/transform/fulfillment'
import type { RawWooCommerceOrder } from '../../../../../../../src/verticals/ecommerce/adapters/wildberries/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeOrder(overrides: Partial<RawWooCommerceOrder> = {}): RawWooCommerceOrder {
  return {
    id: 200,
    status: 'processing',
    currency: 'USD',
    shipping_lines: [
      { id: 10, method_title: 'Flat Rate', total: '5.00' },
    ] as unknown as RawWooCommerceOrder['shipping_lines'],
    line_items: [{ id: 301, name: 'Item A', quantity: 1, price: 10 }],
    date_created_gmt: '2024-04-01T09:00:00Z',
    date_modified_gmt: '2024-04-02T09:00:00Z',
    date_paid_gmt: '2024-04-01T09:05:00Z',
    date_completed_gmt: null,
    ...overrides,
  }
}

describe('transformFulfillment (Wildberries/WooCommerce)', () => {
  it('builds synthetic id from orderId-shippingLineId when shipping line has id', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.id).toBe('200-10')
    expect(result.orderId).toBe('200')
  })

  it('falls back to ful-{orderId} when no shipping line id present', () => {
    const result = transformFulfillment(
      makeOrder({
        shipping_lines: [{ method_title: 'Free Shipping', total: '0.00' }],
      }),
    )
    expect(result.id).toBe('ful-200')
  })

  it('infers status SUCCESS for completed order', () => {
    expect(transformFulfillment(makeOrder({ status: 'completed' })).status).toBe('SUCCESS')
  })

  it('infers status OPEN for processing order', () => {
    expect(transformFulfillment(makeOrder({ status: 'processing' })).status).toBe('OPEN')
  })

  it('infers status CANCELLED for cancelled order', () => {
    expect(transformFulfillment(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('infers status PENDING for pending order', () => {
    expect(transformFulfillment(makeOrder({ status: 'pending' })).status).toBe('PENDING')
  })

  it('reads tracking number and carrier from _wc_shipment_tracking_items meta', () => {
    const result = transformFulfillment(
      makeOrder({
        meta_data: [
          {
            key: '_wc_shipment_tracking_items',
            value: [
              {
                tracking_provider: 'DHL',
                tracking_number: '1234567890',
                date_shipped: '2024-04-01',
              },
            ],
          },
        ],
      }),
    )
    expect(result.trackingNumber).toBe('1234567890')
    expect(result.carrier).toBe('DHL')
  })

  it('falls back to shipping line method_title for carrier when no tracking meta', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.carrier).toBe('Flat Rate')
  })

  it('maps line items from order', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('301')
    expect(result.lineItems![0]!.quantity).toBe(1)
  })

  it('sets shippedAt from date_paid_gmt', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.shippedAt).toBe('2024-04-01T09:05:00Z')
  })

  it('maps timestamps', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.createdAt).toBe('2024-04-01T09:00:00Z')
    expect(result.updatedAt).toBe('2024-04-02T09:00:00Z')
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    expect(() => FulfillmentSchema.parse(transformFulfillment(makeOrder()))).not.toThrow()
  })
})
