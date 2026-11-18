/**
 * The fixture is the documented Response Sample of Get Order List 202309
 * (https://partner.tiktokshop.com/docv2/page/650aa8094a0bb702c06df242),
 * `data.orders[0]`, cut to the fields the transform reads plus a few it
 * ignores; every value is the documented one.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawTikTokOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiktok-shop/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function docOrder(overrides: Partial<RawTikTokOrder> = {}): RawTikTokOrder {
  return {
    id: '576461413038785752',
    status: 'UNPAID',
    user_id: '7021436810468230477',
    buyer_message: 'Please ship asap!',
    create_time: 1619611561,
    update_time: 1619621355,
    paid_time: 1619611563,
    cancel_time: 1678389618,
    cancel_reason: 'Pricing error',
    rts_time: 1619611563,
    packages: [{ id: '1152321127278713123' }],
    payment: {
      currency: 'IDR',
      sub_total: '5000',
      shipping_fee: '5000',
      seller_discount: '5000',
      platform_discount: '5000',
      total_amount: '5000',
      original_total_product_price: '5000',
      tax: '5000',
    },
    recipient_address: {
      full_address: '1199 Coleman Ave San Jose, CA 95110',
      name: 'David Kong',
      address_line1: 'TikTok 5800 bristol Pkwy',
      address_line2: 'Suite 100',
      address_line3: ' ',
      address_line4: ' ',
      postal_code: '95110',
      region_code: 'US',
    },
    line_items: [
      {
        id: '577086512123755123',
        sku_id: '2729382476852921560',
        product_id: '1729582718312380123',
        product_name: "Women's Winter Crochet Clothes",
        sku_name: 'Iphone',
        seller_sku: 'red_iphone_256',
        sale_price: '0.01',
        original_price: '0.01',
        currency: 'IDR',
        seller_discount: '0',
        platform_discount: '0',
        display_status: 'UNPAID',
      },
    ],
    ...overrides,
  }
}

describe('transformOrder (TikTok Shop, documented Get Order List sample)', () => {
  it('parses against OrderSchema and maps the documented fields', () => {
    const o = OrderSchema.parse(transformOrder(docOrder()))
    expect(o).toMatchObject({
      id: '576461413038785752',
      orderNumber: '576461413038785752',
      customerId: '7021436810468230477',
      currency: 'IDR',
      // IDR has two minor digits in ISO 4217: "5000" is 500000 minor units.
      totalPrice: { amount: 500000, currency: 'IDR' },
      subtotalPrice: { amount: 500000, currency: 'IDR' },
      totalShipping: { amount: 500000, currency: 'IDR' },
      totalTax: { amount: 500000, currency: 'IDR' },
      financialStatus: 'PENDING',
      fulfillmentStatus: 'UNFULFILLED',
      note: 'Please ship asap!',
      createdAt: '2021-04-28T12:06:01.000Z',
      updatedAt: '2021-04-28T14:49:15.000Z',
      processedAt: '2021-04-28T12:06:03.000Z',
      shippingAddress: {
        line1: 'TikTok 5800 bristol Pkwy',
        line2: 'Suite 100',
        postalCode: '95110',
        country: 'US',
      },
    })
    // Not cancelled: the documented cancel_time/cancel_reason are not surfaced.
    expect(o.cancelledAt).toBeUndefined()
    expect(o.cancelReason).toBeUndefined()
  })

  it('maps each documented line item as one unit', () => {
    const o = OrderSchema.parse(transformOrder(docOrder()))
    expect(o.lineItems).toEqual([
      expect.objectContaining({
        id: '577086512123755123',
        productId: '1729582718312380123',
        variantId: '2729382476852921560',
        title: "Women's Winter Crochet Clothes",
        quantity: 1,
        price: { amount: 1, currency: 'IDR' },
        sku: 'red_iphone_256',
      }),
    ])
  })

  it('surfaces cancel_time and cancel_reason on a CANCELLED order', () => {
    const o = OrderSchema.parse(transformOrder(docOrder({ status: 'CANCELLED' })))
    expect(o.cancelledAt).toBe('2023-03-09T19:20:18.000Z')
    expect(o.cancelReason).toBe('Pricing error')
    expect(o.financialStatus).toBe('unknown')
    expect(o.fulfillmentStatus).toBe('unknown')
  })

  it('never defaults a currency: with no payment.currency no money or line is built', () => {
    const o = OrderSchema.parse(transformOrder(docOrder({ payment: { total_amount: '5000' } })))
    expect(o.currency).toBeUndefined()
    expect(o.totalPrice).toBeUndefined()
    expect(o.lineItems).toBeUndefined()
  })

  it('omits a money field whose amount is absent instead of writing 0', () => {
    const o = OrderSchema.parse(transformOrder(docOrder({ payment: { currency: 'USD' } })))
    expect(o.totalPrice).toBeUndefined()
    expect(o.totalTax).toBeUndefined()
  })

  it('throws on a line item with no sale_price rather than pricing it at 0', () => {
    expect(() =>
      transformOrder(docOrder({ line_items: [{ id: 'li', product_name: 'x' }] })),
    ).toThrow(/sale_price/)
  })

  it('throws on a line item with no product_name rather than inventing a title', () => {
    expect(() =>
      transformOrder(docOrder({ line_items: [{ id: 'li', sale_price: '1.00' }] })),
    ).toThrow(/product_name/)
  })

  it('a PRE_ORDER on hold is PENDING: payment is only authorized before release', () => {
    const order = transformOrder(docOrder({ status: 'ON_HOLD', order_type: 'PRE_ORDER' }))
    expect(OrderSchema.parse(order).financialStatus).toBe('PENDING')
    const normal = transformOrder(docOrder({ status: 'ON_HOLD', order_type: 'NORMAL' }))
    expect(normal.financialStatus).toBe('PAID')
  })

  it('keeps an explicitly empty line_items as [] and an absent one as undefined', () => {
    expect(transformOrder(docOrder({ line_items: [] })).lineItems).toEqual([])
    expect(transformOrder(docOrder({ line_items: undefined })).lineItems).toBeUndefined()
  })
})

describe('mapFinancialStatus (TikTok Shop documented statuses)', () => {
  it('UNPAID is PENDING; every status after payment is PAID', () => {
    expect(mapFinancialStatus('UNPAID')).toBe('PENDING')
    for (const s of [
      'ON_HOLD',
      'AWAITING_SHIPMENT',
      'PARTIALLY_SHIPPING',
      'AWAITING_COLLECTION',
      'IN_TRANSIT',
      'DELIVERED',
      'COMPLETED',
    ]) {
      expect(mapFinancialStatus(s)).toBe('PAID')
    }
  })

  it('ON_HOLD is PENDING for a PRE_ORDER, whose payment is not yet authorized', () => {
    expect(mapFinancialStatus('ON_HOLD', 'PRE_ORDER')).toBe('PENDING')
    expect(mapFinancialStatus('ON_HOLD', 'NORMAL')).toBe('PAID')
    expect(mapFinancialStatus('AWAITING_SHIPMENT', 'PRE_ORDER')).toBe('PAID')
  })

  it('absent stays undefined; CANCELLED and anything else are unknown', () => {
    expect(mapFinancialStatus(undefined)).toBeUndefined()
    expect(mapFinancialStatus('CANCELLED')).toBe('unknown')
    expect(mapFinancialStatus('121')).toBe('unknown')
  })
})

describe('mapFulfillmentStatus (TikTok Shop documented statuses)', () => {
  it('maps the documented statuses', () => {
    expect(mapFulfillmentStatus('AWAITING_SHIPMENT')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('AWAITING_COLLECTION')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('PARTIALLY_SHIPPING')).toBe('PARTIAL')
    expect(mapFulfillmentStatus('IN_TRANSIT')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('COMPLETED')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('CANCELLED')).toBe('unknown')
    expect(mapFulfillmentStatus(undefined)).toBeUndefined()
  })
})
