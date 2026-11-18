import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawSaleorOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/saleor/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawSaleorOrder> = {}): RawSaleorOrder {
  return {
    id: 'T3JkZXI6MQ==',
    number: '1001',
    status: 'FULFILLED',
    user: { id: 'U1', email: 'ada@example.com' },
    userEmail: 'ada@example.com',
    total: { gross: { amount: 108.24, currency: 'USD' } },
    subtotal: { gross: { amount: 100.0, currency: 'USD' } },
    shippingPrice: { gross: { amount: 4.99, currency: 'USD' } },
    billingAddress: {
      streetAddress1: '1 Programming Ln',
      city: 'London',
      postalCode: 'NW1 2AB',
      country: { code: 'GB' },
    },
    shippingAddress: {
      streetAddress1: '1 Programming Ln',
      city: 'London',
      postalCode: 'NW1 2AB',
      country: { code: 'GB' },
    },
    lines: [
      {
        id: 'LINE1',
        productName: 'Ocean Blue T-Shirt',
        productSku: 'TEE-S-BLUE',
        quantity: 2,
        unitPrice: { gross: { amount: 49.99, currency: 'USD' } },
        variant: { id: 'V1', product: { id: 'P1' } },
      },
    ],
    fulfillments: [{ id: 'F1', status: 'FULFILLED', trackingNumber: '1Z999' }],
    voucherCode: 'SAVE5',
    created: '2024-05-01T10:00:00Z',
    updatedAt: '2024-05-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (Saleor)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('T3JkZXI6MQ==')
    expect(result.orderNumber).toBe('1001')
    expect(result.customerId).toBe('U1')
    expect(result.email).toBe('ada@example.com')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 10824, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'USD' })
  })

  it('maps only the fulfilment values of OrderStatus, and no payment state', () => {
    expect(transformOrder(makeOrder({ status: 'FULFILLED' })).fulfillmentStatus).toBe('FULFILLED')
    expect(transformOrder(makeOrder({ status: 'PARTIALLY_FULFILLED' })).fulfillmentStatus).toBe(
      'PARTIAL',
    )
    expect(transformOrder(makeOrder({ status: 'UNFULFILLED' })).fulfillmentStatus).toBe(
      'UNFULFILLED',
    )
    expect(transformOrder(makeOrder({ status: 'DRAFT' })).fulfillmentStatus).toBeUndefined()
    expect(transformOrder(makeOrder({ status: 'CANCELED' })).fulfillmentStatus).toBeUndefined()
    for (const status of ['FULFILLED', 'DRAFT', 'CANCELED', 'RETURNED']) {
      expect(transformOrder(makeOrder({ status })).financialStatus).toBeUndefined()
    }
  })

  it('takes every currency from the amount it belongs to', () => {
    const result = transformOrder(
      makeOrder({
        total: { gross: { amount: 1000, currency: 'JPY' } },
        subtotal: null,
        shippingPrice: null,
        lines: [
          {
            id: 'L',
            productName: 'Tee',
            quantity: 1,
            unitPrice: { gross: { amount: 1000, currency: 'JPY' } },
          },
        ],
      }),
    )
    expect(result.currency).toBe('JPY')
    expect(result.totalPrice).toEqual({ amount: 1000, currency: 'JPY' })
    expect(result.subtotalPrice).toBeUndefined()
    expect(result.lineItems![0]!.price).toEqual({ amount: 1000, currency: 'JPY' })
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('maps nested line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('LINE1')
    expect(li.productId).toBe('P1')
    expect(li.variantId).toBe('V1')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('maps addresses and fulfillment ids', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentIds).toEqual(['F1'])
    expect(result.discountCodes).toEqual(['SAVE5'])
    expect(result.billingAddress?.country).toBe('GB')
    expect(result.shippingAddress?.postalCode).toBe('NW1 2AB')
  })

  it('treats empty String! address fields as unset', () => {
    const empty = {
      streetAddress1: '',
      streetAddress2: '',
      city: 'London',
      countryArea: '',
      postalCode: '',
      country: { code: '' },
    }
    const result = transformOrder(
      makeOrder({ shippingAddress: empty, billingAddress: { ...empty, city: '' } }),
    )
    expect(result.shippingAddress).toEqual({ city: 'London' })
    expect(result.billingAddress).toBeUndefined()
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('reads the email from userEmail only', () => {
    expect(transformOrder(makeOrder({ userEmail: null })).email).toBeUndefined()
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
})
