import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawIonosOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/ionos/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawIonosOrder> = {}): RawIonosOrder {
  return {
    id: 'order-789',
    orderNumber: 1023,
    customerId: 'cust-55',
    email: 'customer@example.com',
    phone: '+49-30-12345678',
    currency: 'EUR',
    status: 'paid',
    subtotal: 39.98,
    totalTax: 6.38,
    totalDiscounts: 0,
    totalShipping: 4.99,
    total: 51.35,
    lineItems: [
      {
        id: 'li-1',
        productId: 'prod-42',
        variantId: 'var-1',
        name: 'IONOS T-Shirt (S)',
        sku: 'TSHIRT-S',
        quantity: 2,
        unitPrice: 19.99,
        totalDiscount: 0,
        taxLines: [{ name: 'VAT', rate: 0.19, amount: 7.60 }],
      },
    ],
    billingAddress: {
      addressLine1: 'Hauptstraße 1',
      addressLine2: 'Apt 3B',
      city: 'Berlin',
      region: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
    },
    shippingAddress: {
      addressLine1: 'Hauptstraße 1',
      city: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
    },
    discountCodes: ['SUMMER10'],
    tags: ['vip'],
    note: 'Leave at door',
    createdAt: '2024-05-01T10:00:00Z',
    updatedAt: '2024-05-02T08:00:00Z',
    processedAt: '2024-05-01T10:05:00Z',
    ...overrides,
  }
}

describe('transformOrder (IONOS)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('order-789')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('1023')
    expect(result.name).toBe('#1023')
    expect(result.email).toBe('customer@example.com')
    expect(result.phone).toBe('+49-30-12345678')
    expect(result.currency).toBe('EUR')
  })

  it('maps customerId to string', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('cust-55')
  })

  it('maps money fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 3998, currency: 'EUR' })
    expect(result.totalTax).toEqual({ amount: 638, currency: 'EUR' })
    expect(result.totalDiscounts).toEqual({ amount: 0, currency: 'EUR' })
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'EUR' })
    expect(result.totalPrice).toEqual({ amount: 5135, currency: 'EUR' })
  })

  it('maps paid status to PAID financial and UNFULFILLED fulfillment', () => {
    const result = transformOrder(makeOrder({ status: 'paid' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps pending status to PENDING + UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'pending' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps shipped status to PAID + FULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'shipped' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps fulfilled status to PAID + FULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'fulfilled' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps cancelled status to VOIDED + UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps refunded status to REFUNDED + UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('prefers explicit fulfillmentStatus field over status for fulfillment', () => {
    const result = transformOrder(makeOrder({ status: 'paid', fulfillmentStatus: 'fulfilled' }))
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('prefers explicit paymentStatus field over status for financial', () => {
    const result = transformOrder(makeOrder({ status: 'open', paymentStatus: 'authorized' }))
    expect(result.financialStatus).toBe('AUTHORIZED')
  })

  it('maps line items with all fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li-1')
    expect(li.productId).toBe('prod-42')
    expect(li.variantId).toBe('var-1')
    expect(li.title).toBe('IONOS T-Shirt (S)')
    expect(li.sku).toBe('TSHIRT-S')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 1999, currency: 'EUR' })
    expect(li.totalDiscount).toEqual({ amount: 0, currency: 'EUR' })
  })

  it('maps tax lines on line items', () => {
    const result = transformOrder(makeOrder())
    const li = result.lineItems![0]!
    expect(li.taxLines).toHaveLength(1)
    expect(li.taxLines![0]).toMatchObject({
      title: 'VAT',
      rate: 0.19,
      amount: { amount: 760, currency: 'EUR' },
    })
  })

  it('maps billing address using addressLine1 field', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toMatchObject({
      line1: 'Hauptstraße 1',
      line2: 'Apt 3B',
      city: 'Berlin',
      region: 'Berlin',
      postalCode: '10115',
      country: 'DE',
    })
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toMatchObject({
      line1: 'Hauptstraße 1',
      city: 'Berlin',
      postalCode: '10115',
      country: 'DE',
    })
  })

  it('maps street field as fallback for addressLine1', () => {
    const result = transformOrder(
      makeOrder({
        shippingAddress: { street: 'Berliner Str. 5', city: 'Hamburg', postalCode: '20095', country: 'DE' },
      }),
    )
    expect(result.shippingAddress?.line1).toBe('Berliner Str. 5')
  })

  it('maps discount codes, tags, and note', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SUMMER10'])
    expect(result.tags).toEqual(['vip'])
    expect(result.note).toBe('Leave at door')
  })

  it('maps timestamps', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-05-01T10:00:00Z')
    expect(result.updatedAt).toBe('2024-05-02T08:00:00Z')
    expect(result.processedAt).toBe('2024-05-01T10:05:00Z')
  })

  it('maps cancelledAt and cancelReason', () => {
    const result = transformOrder(
      makeOrder({ cancelledAt: '2024-05-03T09:00:00Z', cancelReason: 'customer_request' }),
    )
    expect(result.cancelledAt).toBe('2024-05-03T09:00:00Z')
    expect(result.cancelReason).toBe('customer_request')
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

  it('handles order with no line items or addresses', () => {
    const raw = makeOrder({
      lineItems: [],
      billingAddress: null,
      shippingAddress: null,
      discountCodes: [],
      tags: [],
      note: null,
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toEqual([])
    expect(result.billingAddress).toBeUndefined()
    expect(result.shippingAddress).toBeUndefined()
    expect(result.discountCodes).toBeUndefined()
    expect(result.tags).toBeUndefined()
    expect(result.note).toBeUndefined()
  })

  it('uses items field as fallback for lineItems', () => {
    const raw = makeOrder({
      lineItems: undefined,
      items: [
        { id: 'li-alt-1', name: 'Fallback item', quantity: 1, unitPrice: 9.99 },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.title).toBe('Fallback item')
  })

  it('uses totalPrice field when total is absent', () => {
    const raw = makeOrder({ total: undefined, totalPrice: 55.00 })
    const result = transformOrder(raw)
    expect(result.totalPrice).toEqual({ amount: 5500, currency: 'EUR' })
  })

  it('defaults currency to EUR when not specified', () => {
    const raw = makeOrder({ currency: undefined })
    const result = transformOrder(raw)
    expect(result.currency).toBe('EUR')
    expect(result.totalPrice?.currency).toBe('EUR')
  })
})
