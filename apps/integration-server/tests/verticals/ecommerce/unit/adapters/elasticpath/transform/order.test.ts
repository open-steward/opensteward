import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawEpOrder,
  type RawEpLineItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/elasticpath/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawEpOrder> = {}): RawEpOrder {
  return {
    id: 'ord-001',
    type: 'order',
    status: 'complete',
    payment: 'paid',
    shipping: 'unfulfilled',
    customer: { name: 'Jane Doe', email: 'jane@example.com', id: 'cust-001' },
    billing_address: {
      first_name: 'Jane',
      last_name: 'Doe',
      line_1: '123 Main St',
      city: 'Austin',
      region: 'TX',
      postcode: '78701',
      country: 'US',
    },
    shipping_address: {
      first_name: 'Jane',
      last_name: 'Doe',
      line_1: '456 Elm St',
      city: 'Austin',
      region: 'TX',
      postcode: '78702',
      country: 'US',
    },
    meta: {
      display_price: {
        with_tax: { amount: 5999, currency: 'USD', includes_tax: true },
        without_tax: { amount: 4999, currency: 'USD', includes_tax: false },
        tax: { amount: 1000, currency: 'USD', includes_tax: false },
        discount: { amount: -500, currency: 'USD', includes_tax: false },
        shipping: { amount: 799, currency: 'USD', includes_tax: false },
      },
      timestamps: {
        created_at: '2024-08-01T10:00:00.000Z',
        updated_at: '2024-08-02T14:00:00.000Z',
      },
    },
    ...overrides,
  }
}

function makeLineItem(overrides: Partial<RawEpLineItem> = {}): RawEpLineItem {
  return {
    id: 'li-001',
    type: 'order_item',
    product_id: 'prod-001',
    name: 'Wireless Headphones',
    sku: 'WH-001',
    quantity: 2,
    unit_price: { amount: 2499, currency: 'USD' },
    ...overrides,
  }
}

describe('transformOrder (Elastic Path)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ord-001')
    expect(result.customerId).toBe('cust-001')
    expect(result.email).toBe('jane@example.com')
    expect(result.currency).toBe('USD')
    expect(result.createdAt).toBe('2024-08-01T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-08-02T14:00:00.000Z')
  })

  it('passes through integer minor units for money fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 5999, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 4999, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 1000, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 799, currency: 'USD' })
  })

  it('maps financial status from payment field', () => {
    expect(transformOrder(makeOrder({ payment: 'paid' })).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ payment: 'authorized' })).financialStatus).toBe('AUTHORIZED')
    expect(transformOrder(makeOrder({ payment: 'refunded' })).financialStatus).toBe('REFUNDED')
    expect(transformOrder(makeOrder({ payment: 'unpaid' })).financialStatus).toBe('PENDING')
  })

  it('maps cancelled status to VOIDED', () => {
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.cancelledAt).toBe('2024-08-02T14:00:00.000Z')
  })

  it('maps fulfillment status from shipping field', () => {
    expect(transformOrder(makeOrder({ shipping: 'fulfilled' })).fulfillmentStatus).toBe('FULFILLED')
    expect(transformOrder(makeOrder({ shipping: 'unfulfilled' })).fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toEqual({
      line1: '123 Main St',
      line2: undefined,
      city: 'Austin',
      region: 'TX',
      postalCode: '78701',
      country: 'US',
    })
    expect(result.shippingAddress?.line1).toBe('456 Elm St')
  })

  it('maps line items when provided', () => {
    const result = transformOrder(makeOrder(), [makeLineItem()])
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li-001')
    expect(li.productId).toBe('prod-001')
    expect(li.title).toBe('Wireless Headphones')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2499, currency: 'USD' })
    expect(li.sku).toBe('WH-001')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder(), [makeLineItem()])
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (Elastic Path)', () => {
  it('maps fulfillment status back', () => {
    const body = untransformOrder({ fulfillmentStatus: 'FULFILLED' }) as {
      data: { type: string; shipping: string }
    }
    expect(body.data.type).toBe('order')
    expect(body.data.shipping).toBe('fulfilled')
  })
})
