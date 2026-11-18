import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawBigCommerceOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/bigcommerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawBigCommerceOrder> = {}): RawBigCommerceOrder {
  return {
    id: 1001,
    status: 'Completed',
    status_id: 10,
    customer_id: 100,
    currency_code: 'USD',
    subtotal_ex_tax: '100.00',
    total_tax: '8.25',
    discount_amount: '5.00',
    shipping_cost_ex_tax: '4.99',
    total_inc_tax: '108.24',
    billing_address: {
      street_1: '1 Programming Ln',
      city: 'London',
      zip: 'NW1 2AB',
      country_iso2: 'GB',
      email: 'ada@example.com',
    },
    line_items: [
      {
        id: 9001,
        product_id: 112,
        variant_id: 201,
        name: 'Classic T-Shirt',
        quantity: 2,
        price_ex_tax: '49.99',
        sku: 'TEE-S-RED',
      },
    ],
    customer_message: 'Gift wrap please',
    date_created: '2024-05-01T10:00:00Z',
    date_modified: '2024-05-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(typeof result.id).toBe('string')
    expect(result.customerId).toBe('100')
    expect(result.email).toBe('ada@example.com')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 10824, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'USD' })
  })

  it('maps financial and fulfillment status from Completed', () => {
    const result = transformOrder(makeOrder({ status: 'Completed' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps Pending status correctly', () => {
    const result = transformOrder(makeOrder({ status: 'Pending' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps Partially Shipped status', () => {
    const result = transformOrder(makeOrder({ status: 'Partially Shipped' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps Refunded status', () => {
    const result = transformOrder(makeOrder({ status: 'Refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps Cancelled status', () => {
    const result = transformOrder(makeOrder({ status: 'Cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
    expect(result.cancelledAt).toBeDefined()
  })

  it('maps nested line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.productId).toBe('112')
    expect(li.variantId).toBe('201')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(li.sku).toBe('TEE-S-RED')
  })

  it('maps billing address', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.country).toBe('GB')
    expect(result.billingAddress?.postalCode).toBe('NW1 2AB')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw.customer_message).toBe('Gift wrap please')
    expect(raw.customer_id).toBe(100)
  })
})
