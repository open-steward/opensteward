import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type VirtueMartOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/virtuemart/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<VirtueMartOrder> = {}): VirtueMartOrder {
  return {
    virtuemart_order_id: 456,
    order_number: 'VM1000456',
    order_status: 'C',
    order_total: '59.98',
    order_currency: 'EUR',
    virtuemart_user_id: 789,
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    order_lines: [
      {
        virtuemart_product_id: 1,
        product_name: 'Ceramic Coffee Mug',
        product_quantity: 2,
        product_final_price: '29.99',
        product_sku: 'MUG-001',
      },
    ],
    created_on: '2024-01-15 10:30:00',
    modified_on: '2024-01-16 08:00:00',
    ...overrides,
  }
}

describe('transformOrder (VirtueMart)', () => {
  it('maps core fields and stringifies order id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('456')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('VM1000456')
    expect(result.name).toBe('#VM1000456')
    expect(result.customerId).toBe('789')
    expect(result.email).toBe('john@example.com')
    expect(result.currency).toBe('EUR')
    expect(result.totalPrice).toEqual({ amount: 5998, currency: 'EUR' })
  })

  it('uses order id in name when order_number is absent', () => {
    const result = transformOrder(makeOrder({ order_number: null }))
    expect(result.name).toBe('#456')
    expect(result.orderNumber).toBeUndefined()
  })

  it('maps status C (Confirmed) → PAID financial, UNFULFILLED fulfillment', () => {
    const result = transformOrder(makeOrder({ order_status: 'C' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status P (Pending) → PENDING financial, UNFULFILLED fulfillment', () => {
    const result = transformOrder(makeOrder({ order_status: 'P' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status S (Shipped) → PAID financial, FULFILLED fulfillment', () => {
    const result = transformOrder(makeOrder({ order_status: 'S' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps status X (Cancelled) → VOIDED financial, UNFULFILLED fulfillment', () => {
    const result = transformOrder(makeOrder({ order_status: 'X' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status R (Refunded) → REFUNDED financial, UNFULFILLED fulfillment', () => {
    const result = transformOrder(makeOrder({ order_status: 'R' }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status U (Unconfirmed) → PENDING financial, UNFULFILLED fulfillment', () => {
    const result = transformOrder(makeOrder({ order_status: 'U' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('converts MySQL datetime string to ISO createdAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBeDefined()
    // Should be a valid ISO string
    expect(() => new Date(result.createdAt!)).not.toThrow()
    expect(new Date(result.createdAt!).getFullYear()).toBe(2024)
  })

  it('maps updatedAt from modified_on', () => {
    const result = transformOrder(makeOrder())
    expect(result.updatedAt).toBeDefined()
    expect(new Date(result.updatedAt!).getFullYear()).toBe(2024)
  })

  it('maps line items correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('1')
    expect(li.productId).toBe('1')
    expect(li.title).toBe('Ceramic Coffee Mug')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2999, currency: 'EUR' })
    expect(li.sku).toBe('MUG-001')
  })

  it('handles empty order_lines gracefully', () => {
    const result = transformOrder(makeOrder({ order_lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('handles order with numeric total', () => {
    const result = transformOrder(makeOrder({ order_total: 99.5 }))
    expect(result.totalPrice!.amount).toBe(9950)
  })

  it('defaults total to 0 when null', () => {
    const result = transformOrder(makeOrder({ order_total: null }))
    expect(result.totalPrice!.amount).toBe(0)
  })

  it('falls back to EUR when currency is null', () => {
    const result = transformOrder(makeOrder({ order_currency: null }))
    expect(result.currency).toBe('EUR')
    expect(result.totalPrice!.currency).toBe('EUR')
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

  it('handles null customerId gracefully', () => {
    const result = transformOrder(makeOrder({ virtuemart_user_id: null }))
    expect(result.customerId).toBeUndefined()
  })
})
