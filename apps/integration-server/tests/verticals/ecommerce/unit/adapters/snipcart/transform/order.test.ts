import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawSnipcartOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/snipcart/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawSnipcartOrder> = {}): RawSnipcartOrder {
  return {
    token: 'order-token-abc-123',
    invoiceNumber: 'SNIP-1001',
    status: 'Processed',
    paymentMethod: 'CreditCard',
    email: 'buyer@example.com',
    currency: 'USD',
    subtotal: 49.99,
    taxesTotal: 4.0,
    shippingFees: 5.99,
    total: 59.98,
    customerId: 'cust-guid-999',
    items: [
      {
        uniqueId: 'item-unique-1',
        id: 'product-abc',
        name: 'Blue T-Shirt',
        price: 49.99,
        quantity: 1,
        totalPrice: 49.99,
        sku: 'TSHIRT-BLUE-M',
        taxes: [{ taxName: 'State Tax', taxRate: 0.08, amount: 4.0 }],
      },
    ],
    billingAddress: {
      address1: '123 Main St',
      city: 'Portland',
      country: 'US',
      province: 'OR',
      postalCode: '97201',
    },
    shippingAddress: {
      address1: '456 Oak Ave',
      city: 'Portland',
      country: 'US',
      province: 'OR',
      postalCode: '97202',
    },
    discounts: [{ code: 'SAVE10' }],
    refunds: [{ id: 'refund-guid-1' }],
    notes: 'Leave at door',
    creationDate: '2024-03-01T10:00:00.000Z',
    modificationDate: '2024-03-02T11:00:00.000Z',
    completionDate: '2024-03-02T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrder (Snipcart)', () => {
  it('maps token as id and invoiceNumber as orderNumber', () => {
    const result = transformOrder(makeOrder())
    // token is the primary identifier
    expect(result.id).toBe('order-token-abc-123')
    expect(result.orderNumber).toBe('SNIP-1001')
    expect(result.name).toBe('SNIP-1001')
  })

  it('maps email, customerId and currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('buyer@example.com')
    expect(result.customerId).toBe('cust-guid-999')
    expect(result.currency).toBe('USD')
  })

  it('converts major-unit money fields to minor units', () => {
    const result = transformOrder(makeOrder())
    // 49.99 USD → 4999 cents
    expect(result.subtotalPrice).toEqual({ amount: 4999, currency: 'USD' })
    // 4.00 USD → 400 cents
    expect(result.totalTax).toEqual({ amount: 400, currency: 'USD' })
    // 5.99 USD → 599 cents
    expect(result.totalShipping).toEqual({ amount: 599, currency: 'USD' })
    // 59.98 USD → 5998 cents
    expect(result.totalPrice).toEqual({ amount: 5998, currency: 'USD' })
  })

  it('maps Processed status to PAID financial and UNFULFILLED fulfillment', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps Shipped status to PAID / FULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'Shipped' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps Cancelled status to VOIDED / RESTOCKED', () => {
    const result = transformOrder(makeOrder({ status: 'Cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps line items with minor-unit prices and tax lines', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('item-unique-1')
    expect(li.productId).toBe('product-abc')
    expect(li.title).toBe('Blue T-Shirt')
    expect(li.quantity).toBe(1)
    expect(li.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(li.sku).toBe('TSHIRT-BLUE-M')
    expect(li.taxLines).toHaveLength(1)
    expect(li.taxLines![0]!.title).toBe('State Tax')
    expect(li.taxLines![0]!.rate).toBe(0.08)
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('123 Main St')
    expect(result.billingAddress?.country).toBe('US')
    expect(result.shippingAddress?.line1).toBe('456 Oak Ave')
    expect(result.shippingAddress?.postalCode).toBe('97202')
  })

  it('maps discountCodes and refundIds', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE10'])
    expect(result.refundIds).toEqual(['refund-guid-1'])
  })

  it('maps note and timestamps', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Leave at door')
    expect(result.createdAt).toBe('2024-03-01T10:00:00.000Z')
    expect(result.processedAt).toBe('2024-03-02T12:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })

  it('round-trips via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const body = untransformOrder(canonical)
    expect(body['email']).toBe('buyer@example.com')
    expect(body['notes']).toBe('Leave at door')
  })

  it('untransformOrder maps FULFILLED fulfillmentStatus to Shipped', () => {
    const body = untransformOrder({ fulfillmentStatus: 'FULFILLED' })
    expect(body['status']).toBe('Shipped')
  })
})
