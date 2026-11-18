import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type ShuupOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/shuup/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<ShuupOrder> = {}): ShuupOrder {
  return {
    id: 456,
    identifier: 'ORDER-001',
    status: { identifier: 'processing', name: { en: 'Processing' } },
    payment_status: 'fully_paid',
    shipping_status: 'fully_shipped',
    total_price_value: '59.98',
    currency: 'USD',
    customer: { id: 789, email: 'john@example.com' },
    lines: [
      {
        id: 1,
        product: { id: 123 },
        quantity: '2.000',
        unit_price_value: '29.99',
        text: { en: 'Wireless Keyboard' },
        sku: 'PROD-001',
      },
    ],
    shipping_address: {
      street: '123 Main St',
      city: 'New York',
      region: 'NY',
      postal_code: '10001',
      country: 'US',
    },
    billing_address: {
      street: '123 Main St',
      city: 'New York',
      region: 'NY',
      postal_code: '10001',
      country: 'US',
    },
    order_date: '2024-01-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (Shuup)', () => {
  it('maps core fields and stringifies order id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('456')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('ORDER-001')
    expect(result.name).toBe('#ORDER-001')
    expect(result.customerId).toBe('789')
    expect(result.email).toBe('john@example.com')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 5998, currency: 'USD' })
  })

  it('uses order id in name when identifier is absent', () => {
    const result = transformOrder(makeOrder({ identifier: null }))
    expect(result.name).toBe('#456')
    expect(result.orderNumber).toBeUndefined()
  })

  it('maps order_date to createdAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-01-01T10:00:00Z')
  })

  it('maps payment_status fully_paid → PAID', () => {
    expect(transformOrder(makeOrder({ payment_status: 'fully_paid' })).financialStatus).toBe('PAID')
  })

  it('maps payment_status partially_paid → PARTIALLY_PAID', () => {
    expect(transformOrder(makeOrder({ payment_status: 'partially_paid' })).financialStatus).toBe('PARTIALLY_PAID')
  })

  it('maps payment_status not_paid → PENDING', () => {
    expect(transformOrder(makeOrder({ payment_status: 'not_paid' })).financialStatus).toBe('PENDING')
  })

  it('maps payment_status refunded → REFUNDED', () => {
    expect(transformOrder(makeOrder({ payment_status: 'refunded' })).financialStatus).toBe('REFUNDED')
  })

  it('maps payment_status voided → VOIDED', () => {
    expect(transformOrder(makeOrder({ payment_status: 'voided' })).financialStatus).toBe('VOIDED')
  })

  it('maps shipping_status fully_shipped → FULFILLED', () => {
    expect(transformOrder(makeOrder({ shipping_status: 'fully_shipped' })).fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps shipping_status partially_shipped → PARTIAL', () => {
    expect(transformOrder(makeOrder({ shipping_status: 'partially_shipped' })).fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps shipping_status not_shipped → UNFULFILLED', () => {
    expect(transformOrder(makeOrder({ shipping_status: 'not_shipped' })).fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps line items correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('1')
    expect(li.productId).toBe('123')
    expect(li.title).toBe('Wireless Keyboard')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(li.sku).toBe('PROD-001')
  })

  it('handles translated line item text', () => {
    const result = transformOrder(makeOrder({
      lines: [
        {
          id: 2,
          product: { id: 456 },
          quantity: '1',
          unit_price_value: '9.99',
          text: { fi: 'Suomenkielinen nimi', en: 'English name' },
        },
      ],
    }))
    expect(result.lineItems![0]!.title).toBe('English name')
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toMatchObject({
      line1: '123 Main St',
      city: 'New York',
      region: 'NY',
      postalCode: '10001',
      country: 'US',
    })
  })

  it('maps billing address', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toMatchObject({
      line1: '123 Main St',
      city: 'New York',
    })
  })

  it('handles missing addresses gracefully', () => {
    const result = transformOrder(makeOrder({ shipping_address: null, billing_address: null }))
    expect(result.shippingAddress).toBeUndefined()
    expect(result.billingAddress).toBeUndefined()
  })

  it('handles empty lines array', () => {
    const result = transformOrder(makeOrder({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('defaults currency to USD when missing', () => {
    const result = transformOrder(makeOrder({ currency: null }))
    expect(result.currency).toBe('USD')
    expect(result.totalPrice!.currency).toBe('USD')
  })

  it('parses string total_price_value', () => {
    const result = transformOrder(makeOrder({ total_price_value: '99.95' }))
    expect(result.totalPrice!.amount).toBe(9995)
  })

  it('accepts nested status object', () => {
    const result = transformOrder(
      makeOrder({ status: { identifier: 'complete', name: { en: 'Complete' } } }),
    )
    expect(result.note).toBe('complete')
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
