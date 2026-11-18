/**
 * Wish v3 `Order` → canonical Order.
 *
 * The fixture uses only fields of the v3 `Order` schema in the first-party
 * OpenAPI behind https://merchant.wish.com/documentation/api/v3/reference
 * (id, state, updated_at, released_at, product_information,
 * order_payment.general_payment_details, full_address.shipping_detail), with
 * the schema's own examples where it gives one (Money amount 10.4,
 * currency_code "USD", country_code "US", date-time "2020-01-01T07:00:00.000Z").
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawWishOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/wish/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawWishOrder> = {}): RawWishOrder {
  return {
    id: '5d30f60e0a6fc464f4f376b0',
    state: 'APPROVED',
    updated_at: '2020-01-01T07:00:00.000Z',
    released_at: '2019-12-31T07:00:00.000Z',
    transaction_id: '5d30f60e0a6fc464f4f376a1',
    product_information: {
      id: '5d30f60e0a6fc464f4f376c2',
      variation_id: '5d30f60e0a6fc464f4f376d3',
      name: 'Blue Widget',
      sku: 'BW-001',
      color: 'Blue',
      size: 'M',
    },
    order_payment: {
      general_payment_details: {
        product_price: { amount: 10.4, currency_code: 'USD' },
        product_quantity: 2,
        customer_paid_prices_detail: {
          total: { amount: 25.8, currency_code: 'USD' },
          shipping_price_total: { amount: 5, currency_code: 'USD' },
        },
      },
    },
    full_address: {
      shipping_detail: {
        name: 'John Doe',
        street_address1: '123 Main St',
        street_address2: 'Apt 4B',
        city: 'San Francisco',
        state: 'CA',
        zipcode: '94105',
        country_code: 'US',
        country: 'United States',
      },
    },
    ...overrides,
  }
}

describe('transformOrder (Wish v3)', () => {
  it('produces a payload satisfying OrderSchema', () => {
    const result = OrderSchema.parse(transformOrder(makeOrder()))
    expect(result.id).toBe('5d30f60e0a6fc464f4f376b0')
    expect(result.updatedAt).toBe('2020-01-01T07:00:00.000Z')
  })

  it('builds one line item from product_information and general_payment_details', () => {
    const result = OrderSchema.parse(transformOrder(makeOrder()))
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('5d30f60e0a6fc464f4f376b0')
    expect(li.productId).toBe('5d30f60e0a6fc464f4f376c2')
    expect(li.variantId).toBe('5d30f60e0a6fc464f4f376d3')
    expect(li.title).toBe('Blue Widget')
    expect(li.sku).toBe('BW-001')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 1040, currency: 'USD' })
  })

  it('carries each amount in its own documented currency', () => {
    const result = OrderSchema.parse(
      transformOrder(
        makeOrder({
          order_payment: {
            general_payment_details: {
              product_price: { amount: 1500, currency_code: 'JPY' },
              product_quantity: 1,
            },
          },
        }),
      ),
    )
    expect(result.lineItems![0]!.price).toEqual({ amount: 1500, currency: 'JPY' })
    expect(result.currency).toBeUndefined()
  })

  it('maps customer_paid_prices_detail totals when present', () => {
    const result = OrderSchema.parse(transformOrder(makeOrder()))
    expect(result.totalPrice).toEqual({ amount: 2580, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'USD' })
  })

  it('omits totals and line items rather than inventing them', () => {
    const result = OrderSchema.parse(
      transformOrder(makeOrder({ order_payment: undefined, product_information: undefined })),
    )
    expect(result.totalPrice).toBeUndefined()
    expect(result.totalShipping).toBeUndefined()
    expect(result.lineItems).toBeUndefined()
  })

  it('omits the line item when the unit price is absent', () => {
    const result = OrderSchema.parse(
      transformOrder(
        makeOrder({ order_payment: { general_payment_details: { product_quantity: 1 } } }),
      ),
    )
    expect(result.lineItems).toBeUndefined()
  })

  it.each([
    ['APPROVED', 'PAID', 'UNFULFILLED'],
    ['SHIPPED', 'PAID', 'FULFILLED'],
    ['REFUNDED', 'REFUNDED', undefined],
    ['REQUIRE_REVIEW', 'PENDING', undefined],
    ['DECLINED', undefined, undefined],
  ])('maps state %s to %s / %s', (state, financial, fulfillment) => {
    const result = OrderSchema.parse(transformOrder(makeOrder({ state })))
    expect(result.financialStatus).toBe(financial)
    expect(result.fulfillmentStatus).toBe(fulfillment)
  })

  it('maps full_address.shipping_detail to shippingAddress', () => {
    const result = OrderSchema.parse(transformOrder(makeOrder()))
    expect(result.shippingAddress).toEqual({
      line1: '123 Main St',
      line2: 'Apt 4B',
      city: 'San Francisco',
      region: 'CA',
      postalCode: '94105',
      country: 'US',
    })
  })

  it('preserves the raw order in metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('throws on an order without an id', () => {
    expect(() => transformOrder(makeOrder({ id: undefined }))).toThrow(/no id/)
  })
})
