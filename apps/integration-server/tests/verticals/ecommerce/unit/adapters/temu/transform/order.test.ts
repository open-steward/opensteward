/**
 * Temu order transform. The fixture follows the documented `response_sample`
 * of bg.order.list.v2.get (`result.pageItems[]`), which bg.order.detail.v2.get
 * shares as its `result` (fetched 2026-09-25 from
 * POST https://partner-us.temu.com/riemann/api/v2/api/doc/detail/get).
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawTemuOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/temu/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(parent: Record<string, unknown> = {}): RawTemuOrder {
  return {
    parentOrderMap: {
      parentOrderLabel: [{ name: 'soon_to_be_overdue', value: 0 }],
      shippingMethod: 1,
      parentShippingTime: 1705401600,
      updateTime: 1705574400,
      latestDeliveryTime: 1706000000,
      isShipmentConsolidatedByMainMall: false,
      parentConfirmTime: 1705316000,
      fulfillmentWarning: [],
      parentOrderTime: 1705315200,
      orderPaymentType: 'PPD',
      batchOrderNumberList: [],
      regionId: 211,
      parentOrderSn: 'PO-211-21905452099192792',
      parentOrderPendingFinishTime: 1705316000,
      siteId: 100,
      expectShipLatestTime: 1705574400,
      parentOrderStatus: 4,
      hasShippingFee: false,
      ...parent,
    },
    orderList: [
      {
        orderSn: '211-21905473070712792',
        goodsId: 601099548666279,
        orderStatus: 4,
        quantity: 1,
        originalOrderQuantity: 1,
        canceledQuantityBeforeShipment: 0,
        skuId: 17592352673534,
        goodsName: 'Wireless Headphones',
        spec: 'Black',
        fulfillmentType: 'fulfillBySeller',
      },
    ],
  }
}

describe('transformOrder', () => {
  it('parses with OrderSchema', () => {
    const o = OrderSchema.parse(transformOrder(makeOrder()))
    expect(o.id).toBe('PO-211-21905452099192792')
  })

  it('keys the order on parentOrderSn', () => {
    const o = transformOrder(makeOrder())
    expect(o.id).toBe('PO-211-21905452099192792')
    expect(o.orderNumber).toBe('PO-211-21905452099192792')
  })

  it('maps updateTime (seconds) to updatedAt', () => {
    expect(transformOrder(makeOrder()).updatedAt).toBe('2024-01-18T10:40:00.000Z')
  })

  it('maps the documented parentOrderStatus codes to fulfillment status', () => {
    const f = (s: number) => transformOrder(makeOrder({ parentOrderStatus: s })).fulfillmentStatus
    expect(f(2)).toBe('UNFULFILLED')
    expect(f(4)).toBe('FULFILLED')
    expect(f(5)).toBe('FULFILLED')
    expect(f(41)).toBe('PARTIAL')
    expect(f(51)).toBe('PARTIAL')
    expect(f(1)).toBeUndefined()
    expect(f(3)).toBeUndefined()
  })

  it('invents no money, currency or line items: orderList carries no price', () => {
    const o = transformOrder(makeOrder())
    expect(o.currency).toBeUndefined()
    expect(o.totalPrice).toBeUndefined()
    expect(o.lineItems).toBeUndefined()
    expect(o.createdAt).toBeUndefined()
    expect(o.metadata['orderList']).toEqual(makeOrder().orderList)
  })

  it('throws without parentOrderSn', () => {
    expect(() => transformOrder(makeOrder({ parentOrderSn: undefined }))).toThrow(/parentOrderSn/)
    expect(() => transformOrder({})).toThrow(/parentOrderSn/)
  })
})
