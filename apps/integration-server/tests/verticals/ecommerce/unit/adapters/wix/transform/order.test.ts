/**
 * Wix eCommerce Order → canonical Order.
 *
 * The fixture follows the REST Order schema of Search Orders / Get Order
 * (e-commerce/orders/orders/search-orders.md, get-order.md): `id`,
 * `createdDate`, `lineItems[].price.amount` as a string, `priceSummary.*.amount`,
 * `currency` at order level, and `billingInfo.address.addressLine`. The values
 * are those of Get Order's documented "Get an order" example (order 10124,
 * "Brazilian Arabica", USD 55.70).
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawWixOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/wix/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawWixOrder> = {}): RawWixOrder {
  return {
    id: '67668940-527d-4465-94c6-5475d8c7a412',
    number: '10124',
    createdDate: '2022-07-31T13:42:13.136Z',
    updatedDate: '2022-07-31T14:58:11.663Z',
    lineItems: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        productName: { original: 'Brazilian Arabica', translated: 'Brazilian Arabica' },
        catalogReference: {
          catalogItemId: '0614129c-8777-9f3b-4dfe-b80a54df10d5',
          appId: '215238eb-22a5-4c36-9e7b-e7c08025e04e',
        },
        quantity: 1,
        totalDiscount: { amount: '0', formattedAmount: '$0.00' },
        physicalProperties: { weight: 0.5, shippable: true },
        price: { amount: '48.75', formattedAmount: '$48.75' },
      },
    ],
    buyerInfo: {
      contactId: 'f61f30cd-7474-47b7-95a2-339c0fcacbd3',
      email: 'janedoe@gmail.com',
      visitorId: 'b52ec002-40dd-469c-9f9f-833988e8048d',
    },
    paymentStatus: 'PAID',
    fulfillmentStatus: 'NOT_FULFILLED',
    currency: 'USD',
    priceSummary: {
      subtotal: { amount: '48.75', formattedAmount: '$48.75' },
      shipping: { amount: '5.0', formattedAmount: '$5.00' },
      tax: { amount: '1.95', formattedAmount: '$1.95' },
      discount: { amount: '0', formattedAmount: '$0.00' },
      total: { amount: '55.70', formattedAmount: '$55.70' },
    },
    billingInfo: {
      address: {
        addressLine: '525 5th Avenue',
        city: 'New York',
        subdivision: 'US-NY',
        country: 'US',
        postalCode: '10173',
      },
      contactDetails: { firstName: 'Jane', lastName: 'Doe', phone: '0555555555' },
    },
    shippingInfo: {
      logistics: {
        shippingDestination: {
          address: {
            addressLine: '525 5th Avenue',
            city: 'New York',
            subdivision: 'US-NY',
            country: 'US',
            postalCode: '10173',
          },
          contactDetails: { firstName: 'Jane', lastName: 'Doe', phone: '0555555555' },
        },
      },
    },
    buyerNote: 'This is a buyerNote',
    status: 'APPROVED',
    appliedDiscounts: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('parses with OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })

  it('maps the documented core fields', () => {
    const o = OrderSchema.parse(transformOrder(makeOrder()))
    expect(o.id).toBe('67668940-527d-4465-94c6-5475d8c7a412')
    expect(o.orderNumber).toBe('10124')
    expect(o.customerId).toBe('f61f30cd-7474-47b7-95a2-339c0fcacbd3')
    expect(o.email).toBe('janedoe@gmail.com')
    expect(o.phone).toBe('0555555555')
    expect(o.currency).toBe('USD')
    expect(o.createdAt).toBe('2022-07-31T13:42:13.136Z')
    expect(o.updatedAt).toBe('2022-07-31T14:58:11.663Z')
    expect(o.note).toBe('This is a buyerNote')
  })

  it('reads Price.amount (a string) in the order currency, in minor units', () => {
    const o = OrderSchema.parse(transformOrder(makeOrder()))
    expect(o.subtotalPrice).toEqual({ amount: 4875, currency: 'USD' })
    expect(o.totalShipping).toEqual({ amount: 500, currency: 'USD' })
    expect(o.totalTax).toEqual({ amount: 195, currency: 'USD' })
    expect(o.totalDiscounts).toEqual({ amount: 0, currency: 'USD' })
    expect(o.totalPrice).toEqual({ amount: 5570, currency: 'USD' })
  })

  it('uses the order currency for a zero-decimal currency', () => {
    const o = transformOrder(
      makeOrder({ currency: 'JPY', priceSummary: { total: { amount: '5570' } } }),
    )
    expect(o.totalPrice).toEqual({ amount: 5570, currency: 'JPY' })
  })

  it('leaves money out, never defaulting a currency, when the order has none', () => {
    const o = transformOrder(makeOrder({ currency: undefined, lineItems: [] }))
    expect(o.currency).toBeUndefined()
    expect(o.totalPrice).toBeUndefined()
    expect(o.subtotalPrice).toBeUndefined()
    expect(() => OrderSchema.parse(o)).not.toThrow()
  })

  it('refuses a line item it cannot price rather than inventing an amount', () => {
    expect(() => transformOrder(makeOrder({ currency: undefined }))).toThrow(/price/)
    expect(() =>
      transformOrder(
        makeOrder({ lineItems: [{ id: 'li', productName: { original: 'x' }, quantity: 1 }] }),
      ),
    ).toThrow(/price/)
  })

  it('maps line items from documented fields', () => {
    const li = OrderSchema.parse(transformOrder(makeOrder())).lineItems![0]!
    expect(li.id).toBe('00000000-0000-0000-0000-000000000001')
    expect(li.productId).toBe('0614129c-8777-9f3b-4dfe-b80a54df10d5')
    expect(li.title).toBe('Brazilian Arabica')
    expect(li.quantity).toBe(1)
    expect(li.price).toEqual({ amount: 4875, currency: 'USD' })
    expect(li.totalDiscount).toEqual({ amount: 0, currency: 'USD' })
  })

  it('the unit price is priceBeforeDiscounts, with totalDiscount alongside it', () => {
    // Get Order's "Line Item Discounts" example: Summer T-Shirt.
    const raw = makeOrder()
    raw.lineItems![0] = {
      ...raw.lineItems![0]!,
      quantity: 2,
      totalDiscount: { amount: '10.00', formattedAmount: '$10.00' },
      priceBeforeDiscounts: { amount: '25.00', formattedAmount: '$25.00' },
      price: { amount: '20.00', formattedAmount: '$20.00' },
    }
    const li = OrderSchema.parse(transformOrder(raw)).lineItems![0]!
    expect(li.price).toEqual({ amount: 2500, currency: 'USD' })
    expect(li.totalDiscount).toEqual({ amount: 1000, currency: 'USD' })
  })

  it('falls back to price when priceBeforeDiscounts is absent, as documented', () => {
    const li = transformOrder(makeOrder()).lineItems![0]!
    expect(li.price).toEqual({ amount: 4875, currency: 'USD' })
  })

  it('a pickup order has no shipping address: its logistics hold the pickup location', () => {
    const raw = makeOrder()
    // shippingDestination: "For pickup orders, this contains the pickup
    // location address, not the recipient's address."
    raw.shippingInfo = {
      logistics: {
        shippingDestination: {
          address: { addressLine: '525 5th Avenue', city: 'New York', country: 'US' },
        },
        pickupDetails: {
          address: { addressLine: '525 5th Avenue', city: 'New York', country: 'US' },
          pickupMethod: 'STORE_PICKUP',
        },
      },
    }
    const o = OrderSchema.parse(transformOrder(raw))
    expect(o.shippingAddress).toBeUndefined()
    expect(o.billingAddress?.line1).toBe('525 5th Avenue')
  })

  it('reads the SKU from physicalProperties.sku', () => {
    const raw = makeOrder()
    raw.lineItems![0]!.physicalProperties = { sku: 'BRZ-500' }
    expect(transformOrder(raw).lineItems![0]!.sku).toBe('BRZ-500')
  })

  it('maps paymentStatus values, unknown for ones with no canonical counterpart', () => {
    const fin = (s: string) => transformOrder(makeOrder({ paymentStatus: s })).financialStatus
    expect(fin('PAID')).toBe('PAID')
    expect(fin('NOT_PAID')).toBe('PENDING')
    expect(fin('PENDING')).toBe('PENDING')
    expect(fin('PENDING_MERCHANT')).toBe('PENDING')
    expect(fin('PARTIALLY_PAID')).toBe('PARTIALLY_PAID')
    expect(fin('PARTIALLY_REFUNDED')).toBe('PARTIALLY_REFUNDED')
    expect(fin('FULLY_REFUNDED')).toBe('REFUNDED')
    expect(fin('DECLINED')).toBe('unknown')
    expect(() =>
      OrderSchema.parse(transformOrder(makeOrder({ paymentStatus: 'CANCELED' }))),
    ).not.toThrow()
  })

  it('maps fulfillmentStatus values', () => {
    const ful = (s: string) => transformOrder(makeOrder({ fulfillmentStatus: s })).fulfillmentStatus
    expect(ful('NOT_FULFILLED')).toBe('UNFULFILLED')
    expect(ful('PARTIALLY_FULFILLED')).toBe('PARTIAL')
    expect(ful('FULFILLED')).toBe('FULFILLED')
  })

  it('maps billing and shipping addresses from address.addressLine', () => {
    const o = OrderSchema.parse(transformOrder(makeOrder()))
    expect(o.billingAddress).toEqual({
      line1: '525 5th Avenue',
      city: 'New York',
      region: 'US-NY',
      postalCode: '10173',
      country: 'US',
    })
    expect(o.shippingAddress?.line1).toBe('525 5th Avenue')
  })

  it('collects applied coupon codes', () => {
    const o = transformOrder(
      makeOrder({ appliedDiscounts: [{ coupon: { id: 'c1', code: 'SAVE10', name: 'Save' } }] }),
    )
    expect(o.discountCodes).toEqual(['SAVE10'])
  })

  it('refuses an order without an id', () => {
    expect(() => transformOrder(makeOrder({ id: undefined }))).toThrow(/id/)
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('round-trips the buyer note via untransformOrder', () => {
    expect(untransformOrder(transformOrder(makeOrder())).buyerNote).toBe('This is a buyerNote')
  })
})
