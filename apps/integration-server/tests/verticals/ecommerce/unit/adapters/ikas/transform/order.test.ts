import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawIkasOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/ikas/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawIkasOrder> = {}): RawIkasOrder {
  return {
    id: 'ord-001',
    orderNumber: 1042,
    customer: {
      id: 'cust-abc',
      email: 'zeynep@example.com',
      phone: '+905551234567',
      firstName: 'Zeynep',
      lastName: 'Yılmaz',
    },
    currencyCode: 'TRY',
    totalFinalPrice: 150.0,
    totalPrice: 120.0,
    totalTax: 22.5,
    totalDiscount: 10.0,
    shippingCost: 17.5,
    orderPaymentStatus: 'PAID',
    status: 'DELIVERED',
    orderLineItems: [
      {
        id: 'li-001',
        productId: 'prod-111',
        variantId: 'var-222',
        productName: 'Blue T-Shirt',
        quantity: 2,
        finalPrice: 60.0,
        price: 65.0,
        discount: 5.0,
        sku: 'TEE-BLU-M',
      },
    ],
    billingAddress: {
      addressLine1: 'Bağdat Caddesi No:1',
      city: { name: 'İstanbul' },
      country: { iso2: 'TR' },
      postalCode: '34710',
    },
    shippingAddress: {
      addressLine1: 'Harbiye Cad. 10',
      city: { name: 'İstanbul' },
      country: { iso2: 'TR' },
      postalCode: '34367',
    },
    orderedAt: '2024-03-01T00:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (ikas)', () => {
  it('maps id and orderNumber', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ord-001')
    expect(result.orderNumber).toBe('1042')
  })

  it('maps customer fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('cust-abc')
    expect(result.email).toBe('zeynep@example.com')
    expect(result.phone).toBe('+905551234567')
  })

  it('maps currency and totalPrice in minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('TRY')
    // 150.00 TRY → 15000 minor units
    expect(result.totalPrice).toEqual({ amount: 15000, currency: 'TRY' })
  })

  it('maps PAID payment status → PAID financial status', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps DELIVERED order status → FULFILLED fulfillment status', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps all ikas payment statuses to canonical', () => {
    const cases: [string, string][] = [
      ['WAITING', 'PENDING'],
      ['PAID', 'PAID'],
      ['PARTIALLY_PAID', 'PARTIALLY_PAID'],
      ['REFUNDED', 'REFUNDED'],
      ['CANCELLED', 'VOIDED'],
      ['FAILED', 'VOIDED'],
    ]
    for (const [raw, expected] of cases) {
      const result = transformOrder(makeOrder({ orderPaymentStatus: raw }))
      expect(result.financialStatus).toBe(expected)
    }
  })

  it('maps all ikas order statuses to canonical fulfillment status', () => {
    const cases: [string, string][] = [
      ['CREATED', 'UNFULFILLED'],
      ['PREPARING', 'PARTIAL'],
      ['READY', 'PARTIAL'],
      ['SHIPPED', 'PARTIAL'],
      ['DELIVERED', 'FULFILLED'],
      ['CANCELLED', 'RESTOCKED'],
      ['RETURNED', 'RESTOCKED'],
    ]
    for (const [raw, expected] of cases) {
      const result = transformOrder(makeOrder({ status: raw }))
      expect(result.fulfillmentStatus).toBe(expected)
    }
  })

  it('maps money fields with currency', () => {
    const result = transformOrder(makeOrder())
    // subtotalPrice from totalPrice (120.00 TRY → 12000)
    expect(result.subtotalPrice).toEqual({ amount: 12000, currency: 'TRY' })
    // totalTax 22.50 TRY → 2250
    expect(result.totalTax).toEqual({ amount: 2250, currency: 'TRY' })
    // totalDiscounts 10.00 TRY → 1000
    expect(result.totalDiscounts).toEqual({ amount: 1000, currency: 'TRY' })
    // totalShipping 17.50 TRY → 1750
    expect(result.totalShipping).toEqual({ amount: 1750, currency: 'TRY' })
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li-001')
    expect(li.productId).toBe('prod-111')
    expect(li.variantId).toBe('var-222')
    expect(li.title).toBe('Blue T-Shirt')
    expect(li.quantity).toBe(2)
    // finalPrice 60.00 TRY → 6000 (finalPrice takes precedence over price)
    expect(li.price).toEqual({ amount: 6000, currency: 'TRY' })
    expect(li.sku).toBe('TEE-BLU-M')
  })

  it('maps line item discount', () => {
    const result = transformOrder(makeOrder())
    // discount 5.00 TRY → 500
    expect(result.lineItems![0]!.totalDiscount).toEqual({ amount: 500, currency: 'TRY' })
  })

  it('omits totalDiscount on line items when discount is 0', () => {
    const result = transformOrder(
      makeOrder({
        orderLineItems: [
          {
            id: 'li-002',
            productId: 'prod-111',
            productName: 'Green Shirt',
            quantity: 1,
            finalPrice: 30.0,
            discount: 0,
          },
        ],
      }),
    )
    expect(result.lineItems![0]!.totalDiscount).toBeUndefined()
  })

  it('maps billingAddress and shippingAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('Bağdat Caddesi No:1')
    expect(result.shippingAddress?.line1).toBe('Harbiye Cad. 10')
  })

  it('defaults currency to TRY when currencyCode is null', () => {
    const result = transformOrder(makeOrder({ currencyCode: null }))
    expect(result.currency).toBe('TRY')
  })

  it('maps processedAt from orderedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.processedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('maps unknown status to undefined financial/fulfillment statuses', () => {
    const result = transformOrder(makeOrder({ orderPaymentStatus: 'UNKNOWN', status: 'UNKNOWN' }))
    expect(result.financialStatus).toBeUndefined()
    expect(result.fulfillmentStatus).toBeUndefined()
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const body = untransformOrder(canonical)
    expect((body['customer'] as Record<string, unknown>)['email']).toBe('zeynep@example.com')
    expect(body['currencyCode']).toBe('TRY')
  })
})
