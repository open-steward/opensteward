import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShopifyOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/weebly/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawShopifyOrder> = {}): RawShopifyOrder {
  return {
    id: 5001,
    order_number: 1042,
    name: '#1042',
    email: 'buyer@example.com',
    currency: 'USD',
    financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    total_price: '89.99',
    subtotal_price: '79.99',
    total_tax: '10.00',
    total_discounts: '0.00',
    line_items: [
      {
        id: 1,
        title: 'Widget',
        quantity: 1,
        price: '89.99',
        sku: 'WDG-001',
      },
    ],
    fulfillments: [{ id: 200 }],
    refunds: [{ id: 88 }],
    transactions: [{ id: 999 }],
    discount_codes: [{ code: 'SAVE10' }],
    tags: 'new,priority',
    note: 'Please gift wrap',
    created_at: '2024-05-01T10:00:00.000Z',
    updated_at: '2024-05-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields and stringifies id and orderNumber', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('5001')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('1042')
    expect(typeof result.orderNumber).toBe('string')
    expect(result.name).toBe('#1042')
    expect(result.currency).toBe('USD')
  })

  it('maps financial_status via FIN_STATUS_MAP', () => {
    expect(transformOrder(makeOrder({ financial_status: 'paid' })).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ financial_status: 'pending' })).financialStatus).toBe('PENDING')
    expect(transformOrder(makeOrder({ financial_status: 'authorized' })).financialStatus).toBe('AUTHORIZED')
    expect(transformOrder(makeOrder({ financial_status: 'partially_paid' })).financialStatus).toBe('PARTIALLY_PAID')
    expect(transformOrder(makeOrder({ financial_status: 'refunded' })).financialStatus).toBe('REFUNDED')
    expect(transformOrder(makeOrder({ financial_status: 'partially_refunded' })).financialStatus).toBe('PARTIALLY_REFUNDED')
    expect(transformOrder(makeOrder({ financial_status: 'voided' })).financialStatus).toBe('VOIDED')
  })

  it('maps fulfillment_status via FUL_STATUS_MAP', () => {
    expect(transformOrder(makeOrder({ fulfillment_status: 'fulfilled' })).fulfillmentStatus).toBe('FULFILLED')
    expect(transformOrder(makeOrder({ fulfillment_status: 'unfulfilled' })).fulfillmentStatus).toBe('UNFULFILLED')
    expect(transformOrder(makeOrder({ fulfillment_status: 'partial' })).fulfillmentStatus).toBe('PARTIAL')
    expect(transformOrder(makeOrder({ fulfillment_status: 'restocked' })).fulfillmentStatus).toBe('RESTOCKED')
  })

  it('converts money fields from decimal string to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 8999, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 7999, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 1000, currency: 'USD' })
  })

  it('maps line items with price in minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].id).toBe('1')
    expect(result.lineItems?.[0].title).toBe('Widget')
    expect(result.lineItems?.[0].quantity).toBe(1)
    expect(result.lineItems?.[0].price).toEqual({ amount: 8999, currency: 'USD' })
    expect(result.lineItems?.[0].sku).toBe('WDG-001')
  })

  it('maps referenced ids as string arrays', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentIds).toEqual(['200'])
    expect(result.refundIds).toEqual(['88'])
    expect(result.transactionIds).toEqual(['999'])
    expect(result.discountCodes).toEqual(['SAVE10'])
  })

  it('splits tags string', () => {
    const result = transformOrder(makeOrder())
    expect(result.tags).toEqual(['new', 'priority'])
  })

  it('preserves note', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Please gift wrap')
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

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw.email).toBe('buyer@example.com')
    expect(raw.currency).toBe('USD')
    expect(raw.note).toBe('Please gift wrap')
    expect(raw.tags).toBe('new, priority')
    expect(Array.isArray(raw.line_items)).toBe(true)
  })
})
