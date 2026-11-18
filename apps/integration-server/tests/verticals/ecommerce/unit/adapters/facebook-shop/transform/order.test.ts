/**
 * Fixtures follow the Order API reference's documented objects and sample
 * responses (https://developers.facebook.com/docs/commerce-platform/order-management/order-api):
 * the multi-item sample's `items`, the Get Order Details sample's
 * `estimated_payment_details`, and the `shipping_address` fields.
 * The samples carry no `merchant_order_id`, `product_name` or
 * `shipping_address` values, so those values here are illustrative; only
 * their field names come from the reference. The reference types
 * `shipping_address.country` only as `string` (no format given).
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFulfillmentStatus,
  type RawFacebookOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/facebook-shop/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawFacebookOrder> = {}): RawFacebookOrder {
  return {
    id: '372892946712291',
    order_status: { state: 'CREATED' },
    created: '2019-01-14T19:17:31+00:00',
    last_updated: '2019-01-14T19:47:35+00:00',
    merchant_order_id: 'MERCH-001',
    channel: 'instagram',
    items: {
      data: [
        {
          id: '372892953378957',
          product_id: '2416339625125194',
          retailer_id: 'FB_product_1237',
          product_name: 'Vintage Leather Bag',
          quantity: 1,
          price_per_unit: { amount: '0.99', currency: 'USD' },
        },
        {
          id: '372892943378958',
          product_id: '2654057021279988',
          retailer_id: 'FB_product_1238',
          product_name: 'Canvas Tote',
          quantity: 1,
          price_per_unit: { amount: '0.99', currency: 'USD' },
        },
      ],
    },
    shipping_address: {
      name: 'John Smith',
      street1: '200 Commerce St',
      street2: 'Apt 4B',
      city: 'Portland',
      state: 'OR',
      postal_code: '97201',
      country: 'US',
    },
    estimated_payment_details: {
      subtotal: {
        items: { amount: '2.00', currency: 'USD' },
        shipping: { amount: '0.00', currency: 'USD' },
      },
      tax: { amount: '0.19', currency: 'USD' },
      total_amount: { amount: '2.19', currency: 'USD' },
      tax_remitted: true,
    },
    ...overrides,
  }
}

describe('transformOrder (Facebook Shop)', () => {
  it('parses as a canonical Order and keeps the raw record in metadata', () => {
    const raw = makeOrder()
    const result = OrderSchema.parse(transformOrder(raw))
    expect(result.metadata).toEqual(raw)
  })

  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('372892946712291')
    expect(result.orderNumber).toBe('MERCH-001')
    expect(result.name).toBe('MERCH-001')
    expect(result.createdAt).toBe('2019-01-14T19:17:31+00:00')
    expect(result.updatedAt).toBe('2019-01-14T19:47:35+00:00')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('reads the documented estimated_payment_details, subtotal_details included', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 219, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 200, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 0, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 19, currency: 'USD' })
  })

  it('maps no financial status, discount or cancellation: none is documented', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBeUndefined()
    expect(result.totalDiscounts).toBeUndefined()
    expect(result.cancelledAt).toBeUndefined()
    expect(result.processedAt).toBeUndefined()
  })

  it('maps line items from the documented item fields', () => {
    const li = transformOrder(makeOrder()).lineItems!
    expect(li).toHaveLength(2)
    expect(li[0]).toMatchObject({
      id: '372892953378957',
      productId: '2416339625125194',
      sku: 'FB_product_1237',
      title: 'Vintage Leather Bag',
      quantity: 1,
      price: { amount: 99, currency: 'USD' },
    })
  })

  it('extracts the shipping address', () => {
    expect(transformOrder(makeOrder()).shippingAddress).toEqual({
      line1: '200 Commerce St',
      line2: 'Apt 4B',
      city: 'Portland',
      region: 'OR',
      postalCode: '97201',
      country: 'US',
    })
  })

  it('leaves money, currency and order number unset when absent (default fields only)', () => {
    const result = transformOrder({
      id: '335211597203390',
      order_status: { state: 'CREATED' },
      created: '2019-01-14T19:17:31+00:00',
      last_updated: '2019-01-14T19:47:35+00:00',
    })
    expect(OrderSchema.parse(result)).toBeTruthy()
    expect(result.currency).toBeUndefined()
    expect(result.totalPrice).toBeUndefined()
    expect(result.orderNumber).toBeUndefined()
    expect(result.lineItems).toBeUndefined()
  })

  it('throws rather than invent a price or title for an item', () => {
    const noPrice = makeOrder({
      items: { data: [{ id: 'i1', product_name: 'X', quantity: 1 }] },
    })
    expect(() => transformOrder(noPrice)).toThrow(/price_per_unit/)
    const noName = makeOrder({
      items: {
        data: [{ id: 'i1', quantity: 1, price_per_unit: { amount: '1.00', currency: 'USD' } }],
      },
    })
    expect(() => transformOrder(noName)).toThrow(/product_name/)
  })
})

describe('transformOrder (Facebook Shop) edge cases', () => {
  it('refuses a truncated nested items page rather than return short lineItems', () => {
    const raw = makeOrder()
    raw.items = {
      ...raw.items,
      paging: {
        cursors: { before: 'b', after: 'a' },
        next: 'https://graph.facebook.com/v25.0/372892946712291/items?after=a',
      },
    }
    expect(() => transformOrder(raw)).toThrow(/more items than its nested page/)
    // The last nested page carries cursors but no next, and maps normally.
    raw.items = { ...raw.items, paging: { cursors: { before: 'b', after: 'a' } } }
    expect(transformOrder(raw).lineItems).toHaveLength(2)
  })

  it('treats a currency_amount without its currency as absent, never defaulting one', () => {
    const noCurrency = { amount: '2.19' } as unknown as { amount: string; currency: string }
    const result = transformOrder(
      makeOrder({
        estimated_payment_details: { total_amount: noCurrency, tax: noCurrency },
      }),
    )
    expect(result.totalPrice).toBeUndefined()
    expect(result.totalTax).toBeUndefined()
    expect(result.currency).toBeUndefined()
    const itemNoCurrency = makeOrder({
      items: {
        data: [{ id: 'i1', product_name: 'X', quantity: 1, price_per_unit: noCurrency }],
      },
    })
    expect(() => transformOrder(itemNoCurrency)).toThrow(/price_per_unit/)
  })
})

describe('mapFulfillmentStatus (Facebook Shop)', () => {
  it('maps the documented order states', () => {
    expect(mapFulfillmentStatus('FB_PROCESSING')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('CREATED')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('COMPLETED')).toBe('FULFILLED')
  })

  it('IN_PROGRESS ("some or all items" unshipped) and unknown states map to unknown', () => {
    expect(mapFulfillmentStatus('IN_PROGRESS')).toBe('unknown')
    expect(mapFulfillmentStatus('SOMETHING_NEW')).toBe('unknown')
    expect(mapFulfillmentStatus(undefined)).toBeUndefined()
  })
})
