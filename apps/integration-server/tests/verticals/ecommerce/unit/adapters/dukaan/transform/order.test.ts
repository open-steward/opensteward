import { describe, it, expect } from 'vitest'
import {
  mapFulfillmentStatus,
  transformOrderDetail,
  transformOrderListRow,
  type RawDukaanOrderDetail,
  type RawDukaanOrderListRow,
} from '../../../../../../../src/verticals/ecommerce/adapters/dukaan/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'
import { ORDER_DETAIL, ORDER_LIST_ROW } from '../fixtures'

const listRow = () => structuredClone(ORDER_LIST_ROW) as unknown as RawDukaanOrderListRow
const detail = () => structuredClone(ORDER_DETAIL) as unknown as RawDukaanOrderDetail

const ADDRESS = {
  line1: 'C-607, Sobha Garnet, Bellandur',
  city: 'Bangalore',
  region: 'Karnataka',
  postalCode: '560103',
  country: 'IN',
}

describe('transformOrderListRow (documented get order list row)', () => {
  it('parses against OrderSchema and maps the documented fields', () => {
    const o = OrderSchema.parse(transformOrderListRow(listRow()))
    expect(o.id).toBe('7be5afc5-96e7-4852-91bd-1c6cd9fed408')
    expect(o.orderNumber).toBe('12569605')
    expect(o.email).toBe('neelseth48@gmail.com')
    expect(o.phone).toBe('+91-9884002291')
    expect(o.fulfillmentStatus).toBe('UNFULFILLED') // status 1 = ACCEPTED
    expect(o.shippingAddress).toEqual(ADDRESS)
    expect(o.createdAt).toBe('2024-02-12T07:42:54.931Z')
    expect(o.updatedAt).toBe('2024-02-12T07:43:19.461Z')
    expect(o.metadata).toEqual(listRow())
  })

  it('maps no money: the list row carries no currency', () => {
    const o = OrderSchema.parse(transformOrderListRow(listRow()))
    expect(o.totalPrice).toBeUndefined()
    expect(o.currency).toBeUndefined()
  })
})

describe('transformOrderDetail (documented get order data)', () => {
  it('parses against OrderSchema with the id the list returns', () => {
    const o = OrderSchema.parse(transformOrderDetail(detail()))
    expect(o.id).toBe(OrderSchema.parse(transformOrderListRow(listRow())).id)
    expect(o.orderNumber).toBe('12569605')
    expect(o.customerId).toBe('21333080')
    expect(o.email).toBe('neelseth48@gmail.com')
    expect(o.shippingAddress).toEqual(ADDRESS)
    expect(o.createdAt).toBe('2024-02-12T07:42:54.931Z')
    expect(o.updatedAt).toBe('2024-02-12T07:43:19.461Z')
    expect(o.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps money in store_data.currency.cc, major units to minor', () => {
    const o = OrderSchema.parse(transformOrderDetail(detail()))
    expect(o.currency).toBe('INR')
    expect(o.totalPrice).toEqual({ amount: 2890000, currency: 'INR' })
    expect(o.totalShipping).toEqual({ amount: 0, currency: 'INR' })
    expect(o.totalDiscounts).toEqual({ amount: 0, currency: 'INR' })
    expect(o.lineItems).toHaveLength(2)
    expect(o.lineItems?.[0]).toMatchObject({
      id: '22030039',
      productId: 'd49bc599-ffb3-4728-bcb5-b94ca6ca0483',
      title: "Kylie's PFW Look",
      quantity: 1,
      price: { amount: 1580000, currency: 'INR' },
      totalDiscount: { amount: 0, currency: 'INR' },
      sku: 'kylies-pfw-look',
    })
  })

  it('maps the coupon code and the notes when present', () => {
    // The documented get order data example carries both as null. "Added a sample
    // note" is the documented notes value (create_order request and response), and
    // SAMPLE2 is the documented coupon code (get_discounts results[0].code).
    const o = OrderSchema.parse(
      transformOrderDetail({ ...detail(), coupon_code: 'SAMPLE2', notes: 'Added a sample note' }),
    )
    expect(o.discountCodes).toEqual(['SAMPLE2'])
    expect(o.note).toBe('Added a sample note')
  })

  it('maps no discount codes and no note when the documented example carries null', () => {
    const o = OrderSchema.parse(transformOrderDetail(detail()))
    expect(o.discountCodes).toBeUndefined()
    expect(o.note).toBeUndefined()
  })

  it('maps no money and no line items when the store currency is absent', () => {
    const o = OrderSchema.parse(transformOrderDetail({ ...detail(), store_data: null }))
    expect(o.currency).toBeUndefined()
    expect(o.totalPrice).toBeUndefined()
    expect(o.lineItems).toBeUndefined()
  })
})

describe('mapFulfillmentStatus (Order Status Code Mapping table)', () => {
  it.each([
    [0, 'UNFULFILLED'], // PENDING
    [1, 'UNFULFILLED'], // ACCEPTED
    [3, 'FULFILLED'], // SHIPPED
    [5, 'FULFILLED'], // DELIVERED
    [-1, 'unknown'], // ABANDONED / DRAFT
    [2, 'unknown'], // REJECTED
    [4, 'unknown'], // CANCELLED
    [6, 'unknown'], // FAILED
    [7, 'unknown'], // CANCELLED BY CUSTOMER
    [10, 'unknown'], // RETURNED
  ])('status %i → %s', (code, expected) => {
    expect(mapFulfillmentStatus(code)).toBe(expected)
  })
})
