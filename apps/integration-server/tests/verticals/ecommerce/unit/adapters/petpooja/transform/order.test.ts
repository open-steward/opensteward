import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawPetpoojaOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/petpooja/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawPetpoojaOrder> = {}): RawPetpoojaOrder {
  return {
    orderid: 20001,
    order_number: 42,
    client_order_id: 'CLT-42',
    order_date: '2024-04-10',
    order_time: '12:30:00',
    customer_name: 'Ravi Kumar',
    customer_number: '+91-9876543210',
    customer_email: 'ravi@example.in',
    customer_address: '123 MG Road',
    customer_city: 'Bangalore',
    customer_pincode: '560001',
    total_amount: '350.00',
    discount_amount: '50.00',
    tax_amount: '40.00',
    delivery_charges: '30.00',
    /** 1 = paid online */
    payment_status: 1,
    /** 5 = delivered */
    order_status: 5,
    items: [
      {
        itemid: 301,
        item_name: 'Paneer Tikka',
        quantity: 2,
        price: '125.00',
        variant_id: null,
      },
    ],
    ...overrides,
  }
}

describe('petpooja transformOrder', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('20001')
    expect(result.orderNumber).toBe('42')
    expect(result.name).toBe('CLT-42')
    expect(result.currency).toBe('INR')
    expect(result.email).toBe('ravi@example.in')
    expect(result.phone).toBe('+91-9876543210')
  })

  it('maps financial and fulfillment status', () => {
    const result = transformOrder(makeOrder())
    // payment_status 1 = PAID
    expect(result.financialStatus).toBe('PAID')
    // order_status 5 = FULFILLED
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('converts INR amounts to paise (minor units)', () => {
    const result = transformOrder(makeOrder())
    // 350.00 INR = 35000 paise
    expect(result.totalPrice).toEqual({ amount: 35000, currency: 'INR' })
    expect(result.totalTax).toEqual({ amount: 4000, currency: 'INR' })
    expect(result.totalDiscounts).toEqual({ amount: 5000, currency: 'INR' })
    expect(result.totalShipping).toEqual({ amount: 3000, currency: 'INR' })
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('301')
    expect(li.title).toBe('Paneer Tikka')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 12500, currency: 'INR' })
  })

  it('maps shipping address from customer fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress?.line1).toBe('123 MG Road')
    expect(result.shippingAddress?.city).toBe('Bangalore')
    expect(result.shippingAddress?.postalCode).toBe('560001')
    expect(result.shippingAddress?.country).toBe('IN')
  })

  it('builds ISO datetime from order_date and order_time', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-04-10T12:30:00.000Z')
  })

  it('maps PENDING financial status for payment_status 0', () => {
    const result = transformOrder(makeOrder({ payment_status: 0 }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps UNFULFILLED for order_status 1 (placed)', () => {
    const result = transformOrder(makeOrder({ order_status: 1 }))
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps RESTOCKED for order_status 6 (cancelled)', () => {
    const result = transformOrder(makeOrder({ order_status: 6 }))
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw.customer_number).toBe('+91-9876543210')
    expect(raw.customer_email).toBe('ravi@example.in')
    expect(raw.customer_city).toBe('Bangalore')
    expect(raw.total_amount).toBe('350.00')
  })
})
