import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawStarwebOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/starweb/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawStarwebOrder> = {}): RawStarwebOrder {
  return {
    orderId: 1001,
    createdAt: '2024-03-01T10:00:00.000Z',
    modifiedAt: '2024-03-02T11:00:00.000Z',
    currencyCode: 'SEK',
    totalAmount: 599.0,
    totalVat: 119.8,
    shippingCost: 49.0,
    customerId: 42,
    paymentStatus: 'paid',
    isComplete: false,
    shippingMethodName: 'PostNord',
    shippingTrackingNo: 'SE123456789',
    discountCode: 'WELCOME10',
    internalComment: 'Handle with care',
    items: {
      data: [
        {
          itemId: 5001,
          sku: 'KB-001',
          description: 'Wireless Keyboard',
          quantity: 1,
          unitPrice: 479.2,
          vatRate: 0.25,
        },
      ],
    },
    addresses: {
      data: {
        customerInvoice: {
          firstName: 'Erik',
          lastName: 'Lindqvist',
          address: 'Stortorget 1',
          postalCode: '21121',
          city: 'Malmö',
          countryCode: 'SE',
        },
        customerDelivery: {
          firstName: 'Erik',
          lastName: 'Lindqvist',
          address: 'Södra Förstadsgatan 2',
          postalCode: '21143',
          city: 'Malmö',
          countryCode: 'SE',
        },
      },
    },
    ...overrides,
  }
}

describe('transformOrder (Starweb)', () => {
  it('stringifies orderId as id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#1001')
  })

  it('maps customerId as string', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('42')
  })

  it('maps currencyCode', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('SEK')
  })

  it('converts major-unit money to minor units', () => {
    const result = transformOrder(makeOrder())
    // 599.00 SEK × 100 = 59900 öre
    expect(result.totalPrice).toEqual({ amount: 59900, currency: 'SEK' })
    // 119.80 SEK × 100 = 11980 öre
    expect(result.totalTax).toEqual({ amount: 11980, currency: 'SEK' })
    // 49.00 SEK × 100 = 4900 öre
    expect(result.totalShipping).toEqual({ amount: 4900, currency: 'SEK' })
  })

  it('maps paymentStatus=paid + isComplete=false to PAID/UNFULFILLED', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps paymentStatus=paid + isComplete=true to PAID/FULFILLED', () => {
    const result = transformOrder(makeOrder({ isComplete: true }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps paymentStatus=unpaid to PENDING/UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ paymentStatus: 'unpaid' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps line items from items.data envelope', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('5001')
    expect(li.sku).toBe('KB-001')
    expect(li.title).toBe('Wireless Keyboard')
    expect(li.quantity).toBe(1)
    // 479.20 SEK × 100 = 47920 öre
    expect(li.price).toEqual({ amount: 47920, currency: 'SEK' })
  })

  it('maps billing (customerInvoice) and shipping (customerDelivery) addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('Stortorget 1')
    expect(result.billingAddress?.city).toBe('Malmö')
    expect(result.billingAddress?.country).toBe('SE')
    expect(result.shippingAddress?.line1).toBe('Södra Förstadsgatan 2')
    expect(result.shippingAddress?.postalCode).toBe('21143')
  })

  it('maps discountCode to discountCodes array', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['WELCOME10'])
  })

  it('maps internalComment to note', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Handle with care')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-03-01T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-02T11:00:00.000Z')
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
    expect(body['currencyCode']).toBe('SEK')
    expect(body['discountCode']).toBe('WELCOME10')
    expect(body['internalComment']).toBe('Handle with care')
    expect(body['customerId']).toBe('42')
  })
})
