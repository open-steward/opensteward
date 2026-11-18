import { describe, it, expect } from 'vitest'
import {
  coupangMoney,
  mapFinancialStatus,
  mapFulfillmentStatus,
  transformOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/coupang/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'
import { orderSheetExample } from '../fixtures'

describe('transformOrder (Coupang order sheet)', () => {
  it('maps the documented example and parses as a canonical Order', () => {
    const order = OrderSchema.parse(transformOrder(orderSheetExample()))
    expect(order.id).toBe('642538970006401429')
    expect(order.orderNumber).toBe('22000009546234')
    expect(order.currency).toBe('KRW')
    expect(order.totalShipping).toEqual({ amount: 2500, currency: 'KRW' })
    expect(order.financialStatus).toBe('PAID')
    expect(order.fulfillmentStatus).toBe('FULFILLED')
    expect(order.createdAt).toBe('2025-01-15T22:17:13.973Z')
    expect(order.processedAt).toBe('2025-01-15T22:17:13.973Z')
    expect(order.shippingAddress).toEqual({
      line1: '경기 광명시 하안1동 두산트레지움아파트',
      line2: '107동701호',
      postalCode: '423-747',
    })
    expect(order.lineItems).toEqual([
      expect.objectContaining({
        id: '642538970006401429:001',
        productId: '80240831',
        variantId: '3242596358',
        title: '인디고뱅크키즈 기모 테잎배색 트레이닝 팬츠 IKTM17WG1, 07 DARK GREY, 160호',
        quantity: 1,
        price: { amount: 19900, currency: 'KRW' },
        sku: '170816368810',
      }),
    ])
    // "discountPrice": null in the example: no discount is invented.
    expect(order.lineItems?.[0]?.totalDiscount).toBeUndefined()
  })

  it('reads a numeric shipmentBoxId as its string', () => {
    const order = OrderSchema.parse(transformOrder({ ...orderSheetExample(), shipmentBoxId: 123 }))
    expect(order.id).toBe('123')
    expect(order.lineItems?.[0]?.id).toBe('123:001')
  })

  it('maps a present discountPrice to totalDiscount in its own currency', () => {
    const raw = orderSheetExample()
    raw.orderItems![0]!.discountPrice = { currencyCode: 'KRW', units: 1000, nanos: 0 }
    const order = OrderSchema.parse(transformOrder(raw))
    expect(order.lineItems?.[0]?.totalDiscount).toEqual({ amount: 1000, currency: 'KRW' })
  })

  it('leaves shipping and currency out when shippingPrice is null, rather than defaulting', () => {
    const order = OrderSchema.parse(transformOrder({ ...orderSheetExample(), shippingPrice: null }))
    expect(order.totalShipping).toBeUndefined()
    expect(order.currency).toBeUndefined()
  })

  it('throws on an order sheet with no shipmentBoxId', () => {
    expect(() => transformOrder({ ...orderSheetExample(), shipmentBoxId: undefined })).toThrow(
      /shipmentBoxId/,
    )
  })

  it('throws on an item with no salesPrice, sequenceNo, shippingCount or name', () => {
    for (const key of ['salesPrice', 'sequenceNo', 'shippingCount', 'vendorItemName'] as const) {
      const raw = orderSheetExample()
      delete raw.orderItems![0]![key]
      expect(() => transformOrder(raw), key).toThrow(new RegExp(key))
    }
  })
})

describe('coupangMoney', () => {
  it('adds nanos as the fractional part, scaled by the currency', () => {
    expect(coupangMoney({ currencyCode: 'USD', units: 19, nanos: 990_000_000 })).toEqual({
      amount: 1999,
      currency: 'USD',
    })
    expect(coupangMoney({ currencyCode: 'KRW', units: 19900, nanos: 0 })).toEqual({
      amount: 19900,
      currency: 'KRW',
    })
  })

  it('is undefined without a currency or units', () => {
    expect(coupangMoney({ units: 100, nanos: 0 })).toBeUndefined()
    expect(coupangMoney({ currencyCode: 'KRW', nanos: 0 })).toBeUndefined()
    expect(coupangMoney(null)).toBeUndefined()
  })
})

describe('Coupang PO status mapping', () => {
  it('maps every documented status', () => {
    expect(
      ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY', 'NONE_TRACKING'].map(
        mapFinancialStatus,
      ),
    ).toEqual(['PAID', 'PAID', 'PAID', 'PAID', 'PAID', 'PAID'])
    expect(
      ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY', 'NONE_TRACKING'].map(
        mapFulfillmentStatus,
      ),
    ).toEqual(['UNFULFILLED', 'UNFULFILLED', 'FULFILLED', 'FULFILLED', 'FULFILLED', 'unknown'])
  })

  it('maps an undocumented status to unknown, and none to undefined', () => {
    expect(mapFinancialStatus('CANCEL_DONE')).toBe('unknown')
    expect(mapFulfillmentStatus('CANCEL_DONE')).toBe('unknown')
    expect(mapFinancialStatus(undefined)).toBeUndefined()
    const order = OrderSchema.parse(transformOrder({ ...orderSheetExample(), status: 'SOMETHING' }))
    expect(order.financialStatus).toBe('unknown')
  })
})
