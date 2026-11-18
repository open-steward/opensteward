import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawYokartOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/yokart/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawYokartOrder> = {}): RawYokartOrder {
  return {
    order_id: 1042,
    order_number: '1042',
    user_id: 7,
    buyer_email: 'ada@example.com',
    buyer_phone: '+1 555 000 1111',
    order_status: 'completed',
    order_currency: 'USD',
    order_total_amount: '108.24',
    order_subtotal: '100.00',
    order_tax: '8.25',
    order_discount: '5.00',
    order_shipping: '4.99',
    order_coupon_code: 'SAVE5',
    products: [
      {
        op_id: 9001,
        product_id: 987,
        selprod_id: 111,
        product_name: 'Ocean Blue T-Shirt',
        product_model: 'TEE-S-BLUE',
        op_qty: 2,
        op_unit_price: '49.99',
      },
    ],
    billing_address: {
      oua_address1: '1 Programming Ln',
      oua_city: 'London',
      oua_zip: 'NW1 2AB',
      oua_country: 'GB',
    },
    shipping_address: {
      oua_address1: '1 Programming Ln',
      oua_city: 'London',
      oua_zip: 'NW1 2AB',
      oua_country: 'GB',
    },
    order_date_added: '2024-05-01T10:00:00Z',
    order_date_modified: '2024-05-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1042')
    expect(result.orderNumber).toBe('1042')
    expect(result.name).toBe('#1042')
    expect(result.customerId).toBe('7')
    expect(result.email).toBe('ada@example.com')
    expect(result.phone).toBe('+1 555 000 1111')
    expect(result.currency).toBe('USD')
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
    expect(result.totalPrice).toEqual({ amount: 10824, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 825, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps line items from products array', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.productId).toBe('987')
    expect(li.variantId).toBe('111')
    expect(li.title).toBe('Ocean Blue T-Shirt')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(li.sku).toBe('TEE-S-BLUE')
  })

  it('maps addresses using oua_ prefixed fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('1 Programming Ln')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.billingAddress?.postalCode).toBe('NW1 2AB')
    expect(result.billingAddress?.country).toBe('GB')
    expect(result.shippingAddress?.postalCode).toBe('NW1 2AB')
  })

  it('maps discount codes from coupon code', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE5'])
  })

  it('infers currency from money string when order_currency is absent', () => {
    const result = transformOrder(
      makeOrder({ order_currency: undefined, order_total_amount: '€49.50' }),
    )
    expect(result.currency).toBe('EUR')
    expect(result.totalPrice?.currency).toBe('EUR')
    expect(result.totalPrice?.amount).toBe(4950)
  })

  it('maps order_status=pending to PENDING/UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ order_status: 'pending' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps order_status=confirmed to PAID/UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ order_status: 'confirmed' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps order_status=cancelled to VOIDED and sets cancelledAt', () => {
    const result = transformOrder(
      makeOrder({ order_status: 'cancelled', order_date_modified: '2024-06-01T09:00:00Z' }),
    )
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.cancelledAt).toBeTruthy()
  })

  it('maps order_status=shipped to PAID/PARTIAL', () => {
    const result = transformOrder(makeOrder({ order_status: 'shipped' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps order_status=refunded to REFUNDED', () => {
    const result = transformOrder(makeOrder({ order_status: 'refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('maps order_status=partially_refunded to PARTIALLY_REFUNDED', () => {
    const result = transformOrder(makeOrder({ order_status: 'partially_refunded' }))
    expect(result.financialStatus).toBe('PARTIALLY_REFUNDED')
  })

  it('handles missing products array gracefully (empty lineItems)', () => {
    const result = transformOrder(makeOrder({ products: undefined }))
    expect(result.lineItems).toEqual([])
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw['buyer_email']).toBe('ada@example.com')
    expect(raw['order_currency']).toBe('USD')
    expect(raw['order_coupon_code']).toBe('SAVE5')
  })

  it('untransformOrder maps addresses back', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    const billing = raw['billing_address'] as Record<string, unknown>
    expect(billing['oua_address1']).toBe('1 Programming Ln')
    expect(billing['oua_city']).toBe('London')
    expect(billing['oua_country']).toBe('GB')
  })
})
