import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawNhnOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/nhn-commerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawNhnOrder> = {}): RawNhnOrder {
  return {
    orderNo: 'ORD20240301001',
    orderYmdt: '2024-03-01T00:00:00Z',
    payType: 'CREDIT_CARD',
    lastOrderAmt: {
      payAmt: 55000,
      totalProductAmt: 50000,
      deliveryAmt: 3000,
      immediateDiscountAmt: 0,
      additionalDiscountAmt: 0,
      cartCouponDiscountAmt: 2000,
      productCouponDiscountAmt: 0,
    },
    orderOptions: [
      {
        orderNo: 'ORD20240301001',
        orderOptionNo: 10001,
        productNo: 555,
        productName: 'Wireless Headphones',
        optionValue: 'Black',
        orderCnt: 1,
        orderStatusType: 'PAY_DONE',
        price: { buyAmt: 50000, salePrice: 52000 },
      },
    ],
    member: true,
    ...overrides,
  }
}

describe('transformOrder (NHN Commerce)', () => {
  it('maps orderNo to canonical id, orderNumber, and name', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('ORD20240301001')
    expect(result.orderNumber).toBe('ORD20240301001')
    expect(result.name).toBe('ORD20240301001')
  })

  it('defaults currency to KRW', () => {
    const result = transformOrder(makeRaw())
    expect(result.currency).toBe('KRW')
  })

  it('maps payAmt to totalPrice (KRW has 0 fractional digits, amount unchanged)', () => {
    const result = transformOrder(makeRaw())
    // KRW 0 decimal digits → majorToMinor(55000) = 55000
    expect(result.totalPrice).toEqual({ amount: 55000, currency: 'KRW' })
  })

  it('maps deliveryAmt to totalShipping', () => {
    const result = transformOrder(makeRaw())
    expect(result.totalShipping).toEqual({ amount: 3000, currency: 'KRW' })
  })

  it('sums all discount amounts into totalDiscounts', () => {
    const result = transformOrder(makeRaw())
    // 0 + 0 + 2000 + 0 = 2000
    expect(result.totalDiscounts).toEqual({ amount: 2000, currency: 'KRW' })
  })

  it('maps PAY_DONE status to PAID financial / UNFULFILLED fulfillment', () => {
    const result = transformOrder(makeRaw())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps DELIVERY_DONE status to PAID financial / FULFILLED fulfillment', () => {
    const result = transformOrder(
      makeRaw({
        orderOptions: [{ ...makeRaw().orderOptions![0]!, orderStatusType: 'DELIVERY_DONE' }],
      }),
    )
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps CANCEL_DONE to REFUNDED / RESTOCKED', () => {
    const result = transformOrder(
      makeRaw({
        orderOptions: [{ ...makeRaw().orderOptions![0]!, orderStatusType: 'CANCEL_DONE' }],
      }),
    )
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps orderOptions to lineItems', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('10001')
    expect(li.productId).toBe('555')
    expect(li.title).toBe('Wireless Headphones - Black')
    expect(li.quantity).toBe(1)
    expect(li.price).toEqual({ amount: 50000, currency: 'KRW' })
  })

  it('maps orderYmdt to createdAt as ISO string', () => {
    const result = transformOrder(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (NHN Commerce)', () => {
  it('maps lineItems to orderProducts format', () => {
    const order = transformOrder(makeRaw())
    const body = untransformOrder(order)
    const products = body['orderProducts'] as Array<Record<string, unknown>>
    expect(products).toHaveLength(1)
    expect(products[0]!['productNo']).toBe('555')
    expect(products[0]!['orderCnt']).toBe(1)
  })
})
