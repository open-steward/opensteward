import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawBCOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/bettercommerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawBCOrder> = {}): RawBCOrder {
  return {
    orderId: 'order-001',
    orderNo: 'ORD-1001',
    userId: 'user-001',
    email: 'john@example.com',
    phoneNo: '+44-7700-900001',
    currencyCode: 'GBP',
    paymentStatus: 'paid',
    orderStatus: 'shipped',
    subTotal: 49.98,
    taxAmount: 5.0,
    discount: 0,
    shippingCharge: 5.0,
    grandTotal: 59.98,
    promoCode: 'WELCOME10',
    notes: 'Leave at door',
    orderDate: '2024-03-01T00:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T00:00:00Z',
    items: [
      {
        lineItemId: 'li-001',
        productId: 'prod-100',
        name: 'Running Shoe',
        qty: 2,
        price: 24.99,
        sku: 'SHOE-001',
      },
    ],
    billingAddress: {
      address1: '10 Downing St',
      city: 'London',
      state: 'England',
      postCode: 'SW1A 2AA',
      countryCode: 'GB',
    },
    shippingAddress: {
      address1: '10 Downing St',
      city: 'London',
      postCode: 'SW1A 2AA',
      countryCode: 'GB',
    },
    ...overrides,
  }
}

describe('transformOrder (BetterCommerce)', () => {
  it('maps orderId to id', () => {
    const result = transformOrder(makeOrder({ orderId: 'order-001' }))
    expect(result.id).toBe('order-001')
  })

  it('falls back to recordId', () => {
    const result = transformOrder(makeOrder({ orderId: undefined, recordId: 'rec-abc' }))
    expect(result.id).toBe('rec-abc')
  })

  it('maps orderNo to orderNumber and name', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('ORD-1001')
    expect(result.name).toBe('ORD-1001')
  })

  it('maps paymentStatus=paid to PAID', () => {
    const result = transformOrder(makeOrder({ paymentStatus: 'paid' }))
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps paymentStatus=pending to PENDING', () => {
    const result = transformOrder(makeOrder({ paymentStatus: 'pending' }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps orderStatus=shipped to FULFILLED', () => {
    const result = transformOrder(makeOrder({ orderStatus: 'shipped' }))
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps orderStatus=pending to UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ orderStatus: 'pending' }))
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps orderStatus=cancelled to RESTOCKED', () => {
    const result = transformOrder(makeOrder({ orderStatus: 'cancelled' }))
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('uses currencyCode defaulting to GBP', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('GBP')
  })

  it('converts grandTotal to minor units', () => {
    const result = transformOrder(makeOrder({ grandTotal: 59.98, currencyCode: 'GBP' }))
    expect(result.totalPrice?.amount).toBe(5998)
  })

  it('converts shippingCharge to minor units', () => {
    const result = transformOrder(makeOrder({ shippingCharge: 5.0, currencyCode: 'GBP' }))
    expect(result.totalShipping?.amount).toBe(500)
  })

  it('maps userId to customerId', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('user-001')
  })

  it('maps email and phoneNo', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('john@example.com')
    expect(result.phone).toBe('+44-7700-900001')
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.title).toBe('Running Shoe')
    expect(result.lineItems?.[0]?.quantity).toBe(2)
  })

  it('converts line item price to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems?.[0]?.price.amount).toBe(2499)
  })

  it('maps line item sku', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems?.[0]?.sku).toBe('SHOE-001')
  })

  it('maps billingAddress using countryCode', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('10 Downing St')
    expect(result.billingAddress?.country).toBe('GB')
  })

  it('maps promoCode to discountCodes array', () => {
    const result = transformOrder(makeOrder({ promoCode: 'WELCOME10' }))
    expect(result.discountCodes).toEqual(['WELCOME10'])
  })

  it('maps notes to note', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Leave at door')
  })

  it('maps processedAt from orderDate', () => {
    const result = transformOrder(makeOrder())
    expect(result.processedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (BetterCommerce)', () => {
  it('maps email', () => {
    const body = untransformOrder({ email: 'a@b.com' })
    expect(body.email).toBe('a@b.com')
  })

  it('maps phone to phoneNo', () => {
    const body = untransformOrder({ phone: '+44-7700-900001' })
    expect(body.phoneNo).toBe('+44-7700-900001')
  })

  it('maps currency to currencyCode', () => {
    const body = untransformOrder({ currency: 'GBP' })
    expect(body.currencyCode).toBe('GBP')
  })

  it('converts minor-unit price to major-unit for items', () => {
    const body = untransformOrder({
      lineItems: [
        {
          id: 'li-1',
          productId: 'p',
          title: 'Shoe',
          quantity: 1,
          price: { amount: 2499, currency: 'GBP' },
          metadata: {},
        },
      ],
    })
    const items = body.items as Array<Record<string, unknown>>
    expect(items[0]!.price).toBe(24.99)
  })
})
