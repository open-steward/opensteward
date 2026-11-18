import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawEcwidOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/ecwid/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawEcwidOrder> = {}): RawEcwidOrder {
  return {
    id: 77001,
    orderNumber: 1001,
    customerId: 9001,
    email: 'jane@example.com',
    paymentStatus: 'PAID',
    fulfillmentStatus: 'SHIPPED',
    subtotal: 39.98,
    total: 49.98,
    tax: 5.00,
    couponDiscount: 0,
    discount: 0,
    shippingOption: { shippingRate: 5.00 },
    items: [
      {
        id: 1,
        productId: 100,
        name: 'T-Shirt',
        quantity: 2,
        price: 19.99,
        sku: 'TEE-001',
        tax: 2.50,
        discount: 0,
      },
    ],
    billingPerson: {
      name: 'Jane Doe',
      street: '123 Main St',
      city: 'Stockholm',
      countryCode: 'SE',
      postalCode: '11120',
      phone: '+46701234567',
    },
    shippingPerson: {
      name: 'Jane Doe',
      street: '456 Ship Ave',
      city: 'Gothenburg',
      countryCode: 'SE',
      postalCode: '41101',
    },
    createDate: '2024-02-01T10:00:00Z',
    updateDate: '2024-02-02T14:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (Ecwid)', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('77001')
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#1001')
    expect(result.customerId).toBe('9001')
    expect(result.email).toBe('jane@example.com')
  })

  it('maps PAID + SHIPPED statuses correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps AWAITING_PAYMENT → PENDING', () => {
    const result = transformOrder(makeOrder({ paymentStatus: 'AWAITING_PAYMENT' }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps CANCELLED → VOIDED', () => {
    const result = transformOrder(makeOrder({ paymentStatus: 'CANCELLED' }))
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('maps AWAITING_PROCESSING → UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ fulfillmentStatus: 'AWAITING_PROCESSING' }))
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps money fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 3998, currency: 'USD' })
    expect(result.totalPrice).toEqual({ amount: 4998, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 500, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps line items with unit price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('1')
    expect(li.productId).toBe('100')
    expect(li.title).toBe('T-Shirt')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(li.sku).toBe('TEE-001')
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toBeDefined()
    expect(result.billingAddress!.line1).toBe('123 Main St')
    expect(result.shippingAddress).toBeDefined()
    expect(result.shippingAddress!.city).toBe('Gothenburg')
  })

  it('preserves raw payload in metadata and produces schema-valid result', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const body = untransformOrder(canonical)
    expect(body['email']).toBe('jane@example.com')
    expect((body['billingPerson'] as Record<string, unknown>)['street']).toBe('123 Main St')
    const items = body['items'] as Array<Record<string, unknown>>
    expect(items).toHaveLength(1)
    expect(items[0]!['name']).toBe('T-Shirt')
  })
})
