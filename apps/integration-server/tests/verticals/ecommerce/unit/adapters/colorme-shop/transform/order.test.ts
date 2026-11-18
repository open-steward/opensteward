/**
 * ColorMe Shop Sale → canonical Order — verified against
 * paths["/v1/sales"] in https://api.shop-pro.jp/v1/spec/open_api.json.
 * Financial/fulfillment state is three independent booleans
 * (paid/delivered/canceled), not a status enum.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawColormeSale,
} from '../../../../../../../src/verticals/ecommerce/adapters/colorme-shop/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawColormeSale> = {}): RawColormeSale {
  return {
    id: 1231656323,
    make_date: 1465784934,
    update_date: 1494496809,
    paid: true,
    delivered: false,
    canceled: false,
    product_total_price: 13200000,
    delivery_total_charge: 500,
    tax: 1200,
    total_price: 13202700,
    customer: { id: 1028030, mail: 'taro@example.jp' },
    details: [{ id: 1, product_id: 201, product_name: 'Tシャツ', price: 1980, product_num: 2 }],
    sale_deliveries: [{ address1: '渋谷区', pref_name: '東京都', postal: '1500001', delivered: false }],
    shop_coupon: { code: 'SPRING500' },
    ...overrides,
  }
}

describe('transformOrder (colorme-shop)', () => {
  it('maps id, customerId, and email', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('1231656323')
    expect(result.customerId).toBe('1028030')
    expect(result.email).toBe('taro@example.jp')
  })

  it('derives financialStatus/fulfillmentStatus from the three booleans, never inventing an intermediate state', () => {
    expect(transformOrder(makeRaw({ paid: true, canceled: false })).financialStatus).toBe('PAID')
    expect(transformOrder(makeRaw({ paid: false, canceled: false })).financialStatus).toBe('PENDING')
    expect(transformOrder(makeRaw({ canceled: true })).financialStatus).toBe('VOIDED')
    expect(transformOrder(makeRaw({ delivered: true })).fulfillmentStatus).toBe('FULFILLED')
  })

  it('always reports JPY — the only currency in the entire spec', () => {
    expect(transformOrder(makeRaw()).currency).toBe('JPY')
  })

  it('maps line items from details[]', () => {
    const li = transformOrder(makeRaw()).lineItems![0]!
    expect(li.title).toBe('Tシャツ')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 1980, currency: 'JPY' })
  })

  it('maps shippingAddress from the first sale_delivery', () => {
    expect(transformOrder(makeRaw()).shippingAddress?.region).toBe('東京都')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })

  it('untransformOrder only ever writes `paid` — no invented tracking/shipping fields', () => {
    expect(untransformOrder({ financialStatus: 'PAID' })).toEqual({ paid: true })
    expect(untransformOrder({ financialStatus: 'PENDING' })).toEqual({})
  })
})
