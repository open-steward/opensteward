import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawBumpaOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/bumpa/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

describe('transformOrder (bumpa)', () => {
  const raw: RawBumpaOrder = {
    id: 9001,
    order_number: 'ORD-001',
    customer_id: 200,
    email: 'buyer@bumpa.ng',
    phone: '+2348099998888',
    currency: 'NGN',
    subtotal: '45000.00',
    tax: '2250.00',
    discount: '1000.00',
    shipping: '500.00',
    total: '46750.00',
    payment_status: 'paid',
    fulfillment_status: 'fulfilled',
    order_items: [
      {
        id: 500,
        product_id: 100,
        variant_id: 200,
        name: 'Ankara Fabric',
        quantity: 3,
        price: '15000.00',
        discount: '333.33',
        sku: 'ANK-001',
      },
    ],
    billing_address: {
      address1: '10 Adeola Ave',
      city: 'Abuja',
      country: 'NG',
      postal_code: '900001',
    },
    shipping_address: {
      address1: '10 Adeola Ave',
      city: 'Abuja',
      country: 'NG',
    },
    discount_codes: [{ code: 'BUMPA10' }],
    note: 'Fragile',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    expect(transformOrder(raw).id).toBe('9001')
  })

  it('maps orderNumber', () => {
    expect(transformOrder(raw).orderNumber).toBe('ORD-001')
  })

  it('maps customerId from customer_id', () => {
    expect(transformOrder(raw).customerId).toBe('200')
  })

  it('maps currency', () => {
    expect(transformOrder(raw).currency).toBe('NGN')
  })

  it('maps financialStatus to PAID', () => {
    expect(transformOrder(raw).financialStatus).toBe('PAID')
  })

  it('maps fulfillmentStatus to FULFILLED', () => {
    expect(transformOrder(raw).fulfillmentStatus).toBe('FULFILLED')
  })

  it('converts subtotal to minor units (NGN)', () => {
    // 45000.00 NGN → 4500000 kobo
    expect(transformOrder(raw).subtotalPrice?.amount).toBe(4500000)
    expect(transformOrder(raw).subtotalPrice?.currency).toBe('NGN')
  })

  it('converts total to minor units', () => {
    expect(transformOrder(raw).totalPrice?.amount).toBe(4675000)
  })

  it('maps line items', () => {
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.title).toBe('Ankara Fabric')
    expect(result.lineItems?.[0]?.quantity).toBe(3)
    // 15000.00 NGN → 1500000 kobo
    expect(result.lineItems?.[0]?.price.amount).toBe(1500000)
  })

  it('maps discount codes from array of objects', () => {
    expect(transformOrder(raw).discountCodes).toEqual(['BUMPA10'])
  })

  it('maps discount codes from string array', () => {
    const result = transformOrder({ ...raw, discount_codes: ['CODE1', 'CODE2'] })
    expect(result.discountCodes).toEqual(['CODE1', 'CODE2'])
  })

  it('maps single discount_code string', () => {
    const result = transformOrder({ ...raw, discount_codes: undefined, discount_code: 'SOLO' })
    expect(result.discountCodes).toEqual(['SOLO'])
  })

  it('maps billing address', () => {
    const result = transformOrder(raw)
    expect(result.billingAddress?.line1).toBe('10 Adeola Ave')
    expect(result.billingAddress?.city).toBe('Abuja')
  })

  it('maps note', () => {
    expect(transformOrder(raw).note).toBe('Fragile')
  })

  it('maps PARTIALLY_REFUNDED financial status', () => {
    const result = transformOrder({ ...raw, payment_status: 'partially_refunded' })
    expect(result.financialStatus).toBe('PARTIALLY_REFUNDED')
  })

  it('passes OrderSchema validation', () => {
    expect(() => OrderSchema.parse(transformOrder(raw))).not.toThrow()
  })
})

describe('untransformOrder (bumpa)', () => {
  it('round-trips email and currency', () => {
    const canonical = transformOrder({
      id: 1,
      email: 'test@test.ng',
      currency: 'NGN',
    })
    const body = untransformOrder(canonical)
    expect(body.email).toBe('test@test.ng')
    expect(body.currency).toBe('NGN')
  })
})
