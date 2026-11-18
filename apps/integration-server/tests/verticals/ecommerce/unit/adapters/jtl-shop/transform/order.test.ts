import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawJtlShopOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/jtl-shop/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

describe('transformOrder (jtl-shop)', () => {
  const raw: RawJtlShopOrder = {
    id: 5000,
    orderNumber: 'ORD-2024-001',
    status: 3, // shipped/completed → FULFILLED
    paymentStatus: 'paid',
    currency: 'EUR',
    customer: { id: 42, email: 'hans@example.de', phone: '+4930111222' },
    billingAddress: {
      street: 'Hauptstraße',
      streetNumber: '10',
      city: 'Berlin',
      zip: '10115',
      countryCode: 'DE',
    },
    items: [
      {
        id: 101,
        articleId: 77,
        variantId: 88,
        name: 'Hiking Boot',
        quantity: 2,
        price: '79.99',
        sku: 'HB-42',
      },
    ],
    totalPrice: 159.98,
    subtotalPrice: 134.43,
    totalTax: 25.55,
    shippingCosts: 4.99,
    coupons: [{ code: 'XMAS10' }],
    note: 'Bitte schnell liefern',
    created: '2024-03-01T00:00:00Z',
    modified: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformOrder(raw)
    expect(result.id).toBe('5000')
  })

  it('maps orderNumber and derives name from orderNumber', () => {
    const result = transformOrder(raw)
    expect(result.orderNumber).toBe('ORD-2024-001')
    expect(result.name).toBe('#ORD-2024-001')
  })

  it('maps financial status paid → PAID', () => {
    const result = transformOrder(raw)
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps fulfillment status 3 → FULFILLED', () => {
    const result = transformOrder(raw)
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('converts totalPrice to minor units (EUR × 100)', () => {
    const result = transformOrder(raw)
    // 159.98 EUR → 15998 cents
    expect(result.totalPrice).toEqual({ amount: 15998, currency: 'EUR' })
  })

  it('converts shippingCosts to minor units', () => {
    const result = transformOrder(raw)
    // 4.99 → 499
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'EUR' })
  })

  it('maps customerId from customer.id', () => {
    const result = transformOrder(raw)
    expect(result.customerId).toBe('42')
  })

  it('maps email from customer.email', () => {
    const result = transformOrder(raw)
    expect(result.email).toBe('hans@example.de')
  })

  it('maps line items with minor-unit prices', () => {
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.title).toBe('Hiking Boot')
    // 79.99 EUR → 7999
    expect(result.lineItems![0]!.price).toEqual({ amount: 7999, currency: 'EUR' })
  })

  it('maps coupon codes from coupons array', () => {
    const result = transformOrder(raw)
    expect(result.discountCodes).toEqual(['XMAS10'])
  })

  it('maps billingAddress, joining street + number', () => {
    const result = transformOrder(raw)
    expect(result.billingAddress?.line1).toBe('Hauptstraße 10')
    expect(result.billingAddress?.country).toBe('DE')
  })

  it('produces schema-valid output', () => {
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('maps status 4 (cancelled) → UNFULFILLED', () => {
    const result = transformOrder({ ...raw, status: 4 })
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('round-trips via untransformOrder', () => {
    const result = transformOrder(raw)
    const back = untransformOrder(result)
    expect(back.currency).toBe('EUR')
    expect(back.note).toBe(raw.note)
    expect(back.customer).toEqual({ email: 'hans@example.de', phone: '+4930111222' })
  })
})
