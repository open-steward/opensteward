import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawSapOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/sap-commerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawSapOrder> = {}): RawSapOrder {
  return {
    code: 'ORD-10001',
    statusDisplay: 'processing',
    status: 'CREATED',
    deliveryStatus: 'PENDING',
    entries: [
      {
        entryNumber: 0,
        product: { code: 'HW-1234', name: 'SAP Laptop' },
        quantity: 2,
        basePrice: { currencyIso: 'EUR', value: 1499.99 },
        totalPrice: { currencyIso: 'EUR', value: 2999.98 },
      },
      {
        entryNumber: 1,
        product: { code: 'ACC-0001', name: 'USB-C Adapter' },
        quantity: 1,
        basePrice: { currencyIso: 'EUR', value: 29.99 },
        totalPrice: { currencyIso: 'EUR', value: 29.99 },
      },
    ],
    totalPrice: { currencyIso: 'EUR', value: 3029.97 },
    totalPriceWithTax: { currencyIso: 'EUR', value: 3605.67 },
    totalTax: { currencyIso: 'EUR', value: 575.69 },
    subTotal: { currencyIso: 'EUR', value: 3029.97 },
    deliveryCost: { currencyIso: 'EUR', value: 9.99 },
    totalDiscounts: { currencyIso: 'EUR', value: 0 },
    deliveryAddress: {
      line1: '123 Enterprise Way',
      town: 'Munich',
      postalCode: '80333',
      country: { isocode: 'DE' },
    },
    paymentAddress: {
      line1: '456 Billing St',
      town: 'Berlin',
      postalCode: '10115',
      country: { isocode: 'DE' },
      email: 'john@example.com',
    },
    user: { uid: 'john@example.com', name: 'John Doe' },
    appliedOrderPromotions: [
      { description: '10% off', promotionData: { code: 'SAVE10' } },
    ],
    created: '2024-06-01T10:00:00.000Z',
    statusDate: '2024-06-01T10:30:00.000Z',
    ...overrides,
  }
}

describe('transformOrder (sap-commerce)', () => {
  it('maps core fields', () => {
    const r = transformOrder(makeOrder())
    expect(r.id).toBe('ORD-10001')
    expect(r.orderNumber).toBe('ORD-10001')
    expect(r.name).toBe('#ORD-10001')
    expect(r.customerId).toBe('john@example.com')
    expect(r.email).toBe('john@example.com')
  })

  it('maps price totals', () => {
    const r = transformOrder(makeOrder())
    expect(r.subtotalPrice).toEqual({ amount: 302997, currency: 'EUR' })
    expect(r.totalTax).toEqual({ amount: 57569, currency: 'EUR' })
    expect(r.totalShipping).toEqual({ amount: 999, currency: 'EUR' })
    expect(r.totalPrice?.amount).toBe(360567)
  })

  it('maps financial status from order status', () => {
    expect(transformOrder(makeOrder()).financialStatus).toBe('AUTHORIZED')
    expect(transformOrder(makeOrder({ status: 'COMPLETED' })).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ status: 'CANCELLED' })).financialStatus).toBe('VOIDED')
  })

  it('maps fulfillment status from delivery status', () => {
    expect(transformOrder(makeOrder()).fulfillmentStatus).toBe('UNFULFILLED')
    expect(transformOrder(makeOrder({ deliveryStatus: 'SHIPPED' })).fulfillmentStatus).toBe('FULFILLED')
    expect(transformOrder(makeOrder({ deliveryStatus: 'PARTSHIPPED' })).fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps line items from entries', () => {
    const r = transformOrder(makeOrder())
    expect(r.lineItems).toHaveLength(2)
    expect(r.lineItems![0]!.title).toBe('SAP Laptop')
    expect(r.lineItems![0]!.quantity).toBe(2)
    expect(r.lineItems![0]!.price.amount).toBe(149999)
    expect(r.lineItems![1]!.productId).toBe('ACC-0001')
  })

  it('maps shipping and billing addresses', () => {
    const r = transformOrder(makeOrder())
    expect(r.shippingAddress?.city).toBe('Munich')
    expect(r.shippingAddress?.country).toBe('DE')
    expect(r.billingAddress?.city).toBe('Berlin')
  })

  it('maps discount codes from applied promotions', () => {
    const r = transformOrder(makeOrder())
    expect(r.discountCodes).toEqual(['SAVE10'])
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const r = transformOrder(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const r = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(r)).not.toThrow()
  })

  it('handles order with no entries', () => {
    const r = transformOrder(makeOrder({ entries: undefined }))
    expect(r.lineItems).toBeUndefined()
  })
})

describe('untransformOrder (sap-commerce)', () => {
  it('builds cart entries from canonical line items', () => {
    const body = untransformOrder({
      lineItems: [
        { id: '0', productId: 'HW-1234', title: 'Laptop', quantity: 1, price: { amount: 100, currency: 'EUR' }, metadata: {} },
      ],
      shippingAddress: { line1: '123 Main St', city: 'Berlin', country: 'DE' },
    }) as Record<string, unknown>
    const entries = body['entries'] as Array<Record<string, unknown>>
    expect(entries).toHaveLength(1)
    const addr = body['deliveryAddress'] as Record<string, unknown>
    expect(addr['town']).toBe('Berlin')
  })
})
