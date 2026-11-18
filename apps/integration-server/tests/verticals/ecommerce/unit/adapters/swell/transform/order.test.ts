/**
 * Swell order transform, against "The order model" example
 * (https://developers.swell.is/backend-api/orders); values verbatim, first
 * of its four line items.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawSwellOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/swell/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

const DOC_ORDER: RawSwellOrder = {
  cart_id: '62bc6389912a9800199ea43a',
  draft: false,
  test: true,
  items: [
    {
      product_id: '628ba3c7499bba0019b1a961',
      quantity: 1,
      price: 25,
      id: '62bc63892fafef0019eb2312',
      orig_price: 25,
      delivery: 'shipment',
      price_total: 25,
      discount_total: 3.75,
      discount_each: 3.75,
      tax_total: 0,
      product_name: 'Mannimarco, King of Worms',
      quantity_deliverable: 0,
      quantity_delivered: 1,
    },
  ],
  billing: {
    first_name: 'Sheogorath',
    last_name: null,
    address1: 'New Sheoth Palace',
    address2: null,
    city: 'Shivering Isles',
    state: 'TX',
    zip: '78757',
    country: 'US',
    phone: null,
    method: 'card',
    name: 'Sheogorath',
  },
  shipping: {
    service: 'international',
    service_name: 'International',
    first_name: 'Sheogorath',
    address1: 'New Sheoth Palace',
    address2: null,
    city: 'Shivering Isles',
    zip: '78757',
    country: 'US',
    state: 'TX',
    phone: null,
    name: 'Sheogorath',
  },
  coupon_code: null,
  account_id: '62991607782f3b0013cf17af',
  currency: 'USD',
  notes: 'Do we deliver to the Shivering Isles?',
  comments: null,
  sub_total: 290,
  shipment_price: 0,
  shipment_total: 0,
  discount_total: 43.5,
  grand_total: 246.5,
  payment_balance: 0,
  paid: true,
  refunded: false,
  item_quantity_delivered: 6,
  item_quantity_deliverable: 0,
  delivered: true,
  item_quantity: 6,
  tax_total: 0,
  guest: true,
  date_created: '2022-06-29T14:39:42.350Z',
  status: 'complete',
  payment_total: 246.5,
  refund_total: 0,
  number: '100019',
  date_updated: '2022-06-29T14:42:04.247Z',
  id: '62bc642d912a9800199ea465',
}

describe('swell transformOrder', () => {
  it('maps the documented order example and parses as an Order', () => {
    const o = OrderSchema.parse(transformOrder(DOC_ORDER))
    expect(o.id).toBe('62bc642d912a9800199ea465')
    expect(o.orderNumber).toBe('100019')
    expect(o.customerId).toBe('62991607782f3b0013cf17af')
    expect(o.currency).toBe('USD')
    expect(o.subtotalPrice).toEqual({ amount: 29000, currency: 'USD' })
    expect(o.totalDiscounts).toEqual({ amount: 4350, currency: 'USD' })
    expect(o.totalShipping).toEqual({ amount: 0, currency: 'USD' })
    expect(o.totalTax).toEqual({ amount: 0, currency: 'USD' })
    expect(o.totalPrice).toEqual({ amount: 24650, currency: 'USD' })
    expect(o.financialStatus).toBe('PAID')
    expect(o.fulfillmentStatus).toBe('FULFILLED')
    expect(o.note).toBe('Do we deliver to the Shivering Isles?')
    expect(o.discountCodes).toBeUndefined()
    expect(o.shippingAddress?.postalCode).toBe('78757')
    expect(o.lineItems).toEqual([
      expect.objectContaining({
        id: '62bc63892fafef0019eb2312',
        productId: '628ba3c7499bba0019b1a961',
        title: 'Mannimarco, King of Worms',
        quantity: 1,
        price: { amount: 2500, currency: 'USD' },
        totalDiscount: { amount: 375, currency: 'USD' },
        fulfillableQuantity: 0,
      }),
    ])
  })

  it('derives the other statuses from the documented booleans and totals', () => {
    const status = (o: Partial<RawSwellOrder>) => {
      const r = OrderSchema.parse(transformOrder({ ...DOC_ORDER, ...o }))
      return [r.financialStatus, r.fulfillmentStatus]
    }
    expect(status({ refunded: true })).toEqual(['REFUNDED', 'FULFILLED'])
    expect(status({ refund_total: 10 })).toEqual(['PARTIALLY_REFUNDED', 'FULFILLED'])
    expect(status({ paid: false, payment_total: 5, delivered: false })).toEqual([
      'PARTIALLY_PAID',
      'PARTIAL',
    ])
    expect(
      status({ paid: false, payment_total: 0, delivered: false, item_quantity_delivered: 0 }),
    ).toEqual(['PENDING', 'UNFULFILLED'])
    expect(status({ paid: undefined, refunded: undefined, delivered: undefined })).toEqual([
      undefined,
      undefined,
    ])
  })

  it('omits order money without a currency and refuses line items then', () => {
    expect(() => transformOrder({ ...DOC_ORDER, currency: null })).toThrow(/lacks a price/)
    const o = OrderSchema.parse(transformOrder({ ...DOC_ORDER, currency: null, items: undefined }))
    expect(o.totalPrice).toBeUndefined()
    expect(o.lineItems).toBeUndefined()
  })

  it('titles a custom line item by its description, and refuses one with no price', () => {
    const custom = { id: 'li2', description: 'Engraving', price: 5 }
    const o = OrderSchema.parse(transformOrder({ ...DOC_ORDER, items: [custom] }))
    expect(o.lineItems?.[0]).toMatchObject({ title: 'Engraving', quantity: 1 })
    expect(() =>
      transformOrder({ ...DOC_ORDER, items: [{ id: 'li3', product_name: 'x' }] }),
    ).toThrow(/lacks a price/)
  })
})
