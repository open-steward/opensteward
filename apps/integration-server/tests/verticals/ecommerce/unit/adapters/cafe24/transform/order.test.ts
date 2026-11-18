import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawCafe24Order,
} from '../../../../../../../src/verticals/ecommerce/adapters/cafe24/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

describe('transformOrder (cafe24)', () => {
  const raw: RawCafe24Order = {
    order_id: '20240301-0000001',
    order_date: '2024-03-01T00:00:00Z',
    payment_status: 'payment_complete',
    order_status: 'delivered',
    buyer_name: 'Lee Minho',
    buyer_email: 'minho@example.kr',
    buyer_phone: '010-1234-5678',
    member_id: 'member001',
    currency: 'KRW',
    order_price_amount: 50000,
    shipping_price: 2500,
    actual_price: 52500,
    tax: 4500,
    coupon_discount_price: 3000,
    order_items: [
      {
        order_item_code: 'OI-001',
        product_no: 999,
        variant_code: 'P0000999-001',
        product_name: 'K-Beauty Set',
        quantity: 2,
        product_price: 25000,
        actual_product_price: 25000,
        product_code: 'PRD-KBS-001',
      },
    ],
    shipping_address: {
      address1: '10 Hangang Rd',
      city: 'Seoul',
      zipcode: '04520',
      country_code: 'KR',
    },
    billing_address: {
      address1: '10 Hangang Rd',
      city: 'Seoul',
      zipcode: '04520',
      country_code: 'KR',
    },
    note: 'Leave at door',
    updated_date: '2024-03-01T00:00:00Z',
  }

  it('maps id from order_id', () => {
    expect(transformOrder(raw).id).toBe('20240301-0000001')
  })

  it('maps orderNumber from order_id', () => {
    expect(transformOrder(raw).orderNumber).toBe('20240301-0000001')
  })

  it('maps customerId from member_id', () => {
    expect(transformOrder(raw).customerId).toBe('member001')
  })

  it('maps email from buyer_email', () => {
    expect(transformOrder(raw).email).toBe('minho@example.kr')
  })

  it('maps currency', () => {
    expect(transformOrder(raw).currency).toBe('KRW')
  })

  it('maps financialStatus payment_complete → PAID', () => {
    expect(transformOrder(raw).financialStatus).toBe('PAID')
  })

  it('maps fulfillmentStatus delivered → FULFILLED', () => {
    expect(transformOrder(raw).fulfillmentStatus).toBe('FULFILLED')
  })

  it('converts subtotal to minor units (KRW: major=minor since no subunits)', () => {
    // KRW has 0 fractional digits: 50000 major = 50000 minor
    expect(transformOrder(raw).subtotalPrice?.amount).toBe(50000)
    expect(transformOrder(raw).subtotalPrice?.currency).toBe('KRW')
  })

  it('converts totalPrice to minor units', () => {
    expect(transformOrder(raw).totalPrice?.amount).toBe(52500)
  })

  it('converts totalShipping to minor units', () => {
    expect(transformOrder(raw).totalShipping?.amount).toBe(2500)
  })

  it('converts totalDiscounts from coupon_discount_price', () => {
    expect(transformOrder(raw).totalDiscounts?.amount).toBe(3000)
  })

  it('maps line items', () => {
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.id).toBe('OI-001')
    expect(result.lineItems?.[0]?.title).toBe('K-Beauty Set')
    expect(result.lineItems?.[0]?.quantity).toBe(2)
    expect(result.lineItems?.[0]?.price.amount).toBe(25000)
    expect(result.lineItems?.[0]?.sku).toBe('PRD-KBS-001')
  })

  it('maps shipping address', () => {
    const result = transformOrder(raw)
    expect(result.shippingAddress?.line1).toBe('10 Hangang Rd')
    expect(result.shippingAddress?.city).toBe('Seoul')
    expect(result.shippingAddress?.country).toBe('KR')
  })

  it('maps note', () => {
    expect(transformOrder(raw).note).toBe('Leave at door')
  })

  it('maps awaiting_payment → PENDING financial status', () => {
    expect(transformOrder({ ...raw, payment_status: 'awaiting_payment' }).financialStatus).toBe(
      'PENDING',
    )
  })

  it('maps refund_complete → REFUNDED financial status', () => {
    expect(transformOrder({ ...raw, payment_status: 'refund_complete' }).financialStatus).toBe(
      'REFUNDED',
    )
  })

  it('maps order_complete → UNFULFILLED fulfillment status', () => {
    expect(transformOrder({ ...raw, order_status: 'order_complete' }).fulfillmentStatus).toBe(
      'UNFULFILLED',
    )
  })

  it('maps delivering → PARTIAL fulfillment status', () => {
    expect(transformOrder({ ...raw, order_status: 'delivering' }).fulfillmentStatus).toBe('PARTIAL')
  })

  it('passes OrderSchema validation', () => {
    expect(() => OrderSchema.parse(transformOrder(raw))).not.toThrow()
  })
})

describe('untransformOrder (cafe24)', () => {
  it('round-trips email, phone, and note', () => {
    const canonical = transformOrder(raw)
    const body = untransformOrder(canonical)
    expect(body.buyer_email).toBe('minho@example.kr')
    expect(body.buyer_phone).toBe('010-1234-5678')
    expect(body.note).toBe('Leave at door')
  })
})

const raw: RawCafe24Order = {
  order_id: '20240301-0000001',
  order_date: '2024-03-01T00:00:00Z',
  payment_status: 'payment_complete',
  order_status: 'delivered',
  buyer_email: 'minho@example.kr',
  buyer_phone: '010-1234-5678',
  member_id: 'member001',
  currency: 'KRW',
  order_price_amount: 50000,
  actual_price: 52500,
  note: 'Leave at door',
}
