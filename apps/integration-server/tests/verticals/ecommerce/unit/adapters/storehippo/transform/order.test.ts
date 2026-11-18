import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawStoreHippoOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/storehippo/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'
import { ORDER, ORDER_GET } from '../fixtures'

const listRow = (): RawStoreHippoOrder => structuredClone(ORDER) as RawStoreHippoOrder

describe('StoreHippo transformOrder (documented ms-orders example responses)', () => {
  it('maps the "list orders" example and parses with OrderSchema', () => {
    const o = OrderSchema.parse(transformOrder(listRow()))
    expect(o.id).toBe('55bef9159cad703e28e43b5e')
    expect(o.orderNumber).toBe('OID221')
    expect(o.email).toBe('charmingme.s@gmail.com')
    expect(o.customerId).toBeUndefined()
    expect(o.currency).toBe('INR')
    expect(o.totalPrice).toEqual({ amount: 44860, currency: 'INR' })
    expect(o.subtotalPrice).toEqual({ amount: 39960, currency: 'INR' })
    expect(o.totalShipping).toEqual({ amount: 4900, currency: 'INR' })
    expect(o.totalTax).toEqual({ amount: 0, currency: 'INR' })
    expect(o.financialStatus).toBe('PAID')
    expect(o.createdAt).toBe('2015-08-03T05:16:05.021Z')
    expect(o.updatedAt).toBe('2015-08-03T09:43:08.162Z')
  })

  it('maps the documented line item, with the variant id in the variants id space', () => {
    const o = transformOrder(listRow())
    expect(o.lineItems).toEqual([
      expect.objectContaining({
        id: '55bc94ade2b2ac2728d4e827',
        productId: '554764ca0553a0bc62500152',
        variantId: '554764ca0553a0bc62500152:White|L',
        title: 'Polka Dot Shirt /TSF3447',
        quantity: 1,
        price: { amount: 39960, currency: 'INR' },
      }),
    ])
  })

  it('maps the "Retrieve a Single Order" example, whose currency is empty, with no money', () => {
    const o = OrderSchema.parse(transformOrder(structuredClone(ORDER_GET) as RawStoreHippoOrder))
    expect(o.id).toBe('5eba49392150fba9a26b57c1')
    expect(o.orderNumber).toBe('OID1762')
    expect(o.customerId).toBe('5e1ec5203735093314764ce4')
    expect(o.financialStatus).toBe('PENDING')
    expect(o.currency).toBeUndefined()
    expect(o.totalPrice).toBeUndefined()
    expect(o.lineItems).toBeUndefined()
    expect(o.billingAddress).toEqual({
      line1: 'B4-309 Spaze iTech Park, Sector-49, Sohna Road',
      city: 'Gurgoan',
      region: 'Harayana',
      postalCode: '122001',
      country: 'IN',
    })
  })

  it('reads coupon codes from the documented cart-level discounts', () => {
    const o = OrderSchema.parse(
      transformOrder({
        ...listRow(),
        discounts: [
          { _id: '53b256e9b3af14aa15e451a5', saving_amount: 100, coupon_code: 'Get 100' },
        ],
      }),
    )
    expect(o.discountCodes).toEqual(['Get 100'])
  })

  it('an undocumented financial_status is unknown', () => {
    expect(transformOrder({ ...listRow(), financial_status: 'Refunded' }).financialStatus).toBe(
      'unknown',
    )
  })

  it('throws on a record without _id', () => {
    expect(() => transformOrder({ order_id: 'OID1' })).toThrow(/_id/)
  })

  it('untransformOrder keeps the email', () => {
    expect(untransformOrder({ email: 'a@b.co' })['email']).toBe('a@b.co')
  })
})
