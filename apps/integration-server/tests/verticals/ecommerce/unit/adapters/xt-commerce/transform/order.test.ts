import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawWooCommerceOrder,
  type RawWooCommerceLineItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/xt-commerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeLineItem(
  overrides: Partial<RawWooCommerceLineItem> = {},
): RawWooCommerceLineItem {
  return {
    id: 1,
    name: 'Blue Widget',
    product_id: 101,
    variation_id: 202,
    quantity: 2,
    price: 19.99,
    total: '39.98',
    subtotal: '39.98',
    sku: 'BW-001',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RawWooCommerceOrder> = {}): RawWooCommerceOrder {
  return {
    id: 1042,
    number: '1042',
    status: 'processing',
    currency: 'EUR',
    customer_id: 5,
    billing: {
      address_1: '10 Baker St',
      city: 'London',
      postcode: 'W1U 3BW',
      country: 'GB',
      email: 'buyer@example.com',
      phone: '+442071234567',
    },
    shipping: {
      address_1: '10 Baker St',
      city: 'London',
      postcode: 'W1U 3BW',
      country: 'GB',
    },
    total: '49.97',
    subtotal: '39.98',
    shipping_total: '9.99',
    total_tax: '0.00',
    discount_total: '0.00',
    line_items: [makeLineItem()],
    coupon_lines: [],
    refunds: [],
    date_created_gmt: '2024-06-10T08:00:00Z',
    date_modified_gmt: '2024-06-11T12:00:00Z',
    customer_note: 'Please leave at door',
    ...overrides,
  }
}

describe('transformOrder (xt-commerce)', () => {
  it('maps id to string', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1042')
  })

  it('maps number to orderNumber and name', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('1042')
    expect(result.name).toBe('#1042')
  })

  it('maps currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('EUR')
  })

  it('maps status=processing to PAID + UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'processing' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status=completed to PAID + FULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'completed' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps status=cancelled to VOIDED + UNFULFILLED and sets cancelledAt', () => {
    const result = transformOrder(
      makeOrder({ status: 'cancelled', date_modified_gmt: '2024-07-01T00:00:00Z' }),
    )
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.cancelledAt).toBe('2024-07-01T00:00:00Z')
  })

  it('maps status=refunded to REFUNDED', () => {
    const result = transformOrder(makeOrder({ status: 'refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('maps status=pending to PENDING + UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'pending' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps billing email and phone', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('buyer@example.com')
    expect(result.phone).toBe('+442071234567')
  })

  it('maps customer_id to customerId string', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('5')
  })

  it('maps total to totalPrice in minor units', () => {
    const result = transformOrder(makeOrder({ total: '49.97', currency: 'EUR' }))
    expect(result.totalPrice?.amount).toBe(4997)
    expect(result.totalPrice?.currency).toBe('EUR')
  })

  it('maps shipping_total to totalShipping in minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalShipping?.amount).toBe(999)
  })

  it('maps line items correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('1')
    expect(li.title).toBe('Blue Widget')
    expect(li.quantity).toBe(2)
    expect(li.productId).toBe('101')
    expect(li.variantId).toBe('202')
    expect(li.sku).toBe('BW-001')
    // unit price 19.99 → 1999 minor
    expect(li.price.amount).toBe(1999)
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('10 Baker St')
    expect(result.billingAddress?.country).toBe('GB')
    expect(result.shippingAddress?.city).toBe('London')
  })

  it('maps customer_note to note', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Please leave at door')
  })

  it('maps date_created_gmt to createdAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-06-10T08:00:00Z')
  })

  it('maps date_modified_gmt to updatedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.updatedAt).toBe('2024-06-11T12:00:00Z')
  })

  it('does not set cancelledAt for non-cancelled orders', () => {
    const result = transformOrder(makeOrder({ status: 'processing' }))
    expect(result.cancelledAt).toBeUndefined()
  })

  it('maps coupon_lines to discountCodes', () => {
    const result = transformOrder(
      makeOrder({ coupon_lines: [{ code: 'SAVE10' }] }),
    )
    expect(result.discountCodes).toEqual(['SAVE10'])
  })

  it('maps refunds to refundIds', () => {
    const result = transformOrder(
      makeOrder({ refunds: [{ id: 77, total: '-9.99' }] }),
    )
    expect(result.refundIds).toEqual(['77'])
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (xt-commerce)', () => {
  it('maps currency and note', () => {
    const body = untransformOrder({ currency: 'EUR', note: 'Test note' })
    expect(body['currency']).toBe('EUR')
    expect(body['customer_note']).toBe('Test note')
  })

  it('maps billingAddress to billing block', () => {
    const body = untransformOrder({
      billingAddress: { line1: '1 High St', city: 'London', country: 'GB' },
      email: 'x@x.com',
    })
    expect((body['billing'] as Record<string, unknown>)['address_1']).toBe('1 High St')
    expect((body['billing'] as Record<string, unknown>)['country']).toBe('GB')
  })
})
