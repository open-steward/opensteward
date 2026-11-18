import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawLsOrder,
  type RawLsOrderAttributes,
  type RawLsFirstOrderItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/lemon-squeezy/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeFirstItem(overrides: Partial<RawLsFirstOrderItem> = {}): RawLsFirstOrderItem {
  return {
    id: 1,
    order_id: 100,
    product_id: 200,
    variant_id: 300,
    product_name: 'Digital Toolkit',
    variant_name: 'Pro Edition',
    price: 4999,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeAttrs(overrides: Partial<RawLsOrderAttributes> = {}): RawLsOrderAttributes {
  return {
    store_id: 1,
    customer_id: 42,
    identifier: 'abc-123-uuid',
    order_number: 1001,
    user_name: 'Jane Doe',
    user_email: 'jane@example.com',
    currency: 'USD',
    currency_rate: '1.0',
    subtotal: 4999,
    discount_total: 0,
    tax: 400,
    total: 5399,
    status: 'paid',
    refunded: false,
    first_order_item: makeFirstItem(),
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeRaw(attrsOverrides: Partial<RawLsOrderAttributes> = {}): RawLsOrder {
  return {
    id: 'ord-100',
    type: 'orders',
    attributes: makeAttrs(attrsOverrides),
  }
}

describe('transformOrder (lemon-squeezy)', () => {
  it('maps raw.id to id', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('ord-100')
  })

  it('maps order_number to orderNumber string', () => {
    const result = transformOrder(makeRaw())
    expect(result.orderNumber).toBe('1001')
  })

  it('builds name from order_number', () => {
    const result = transformOrder(makeRaw())
    expect(result.name).toBe('#1001')
  })

  it('maps customer_id to customerId', () => {
    const result = transformOrder(makeRaw())
    expect(result.customerId).toBe('42')
  })

  it('maps user_email to email', () => {
    const result = transformOrder(makeRaw())
    expect(result.email).toBe('jane@example.com')
  })

  it('maps currency', () => {
    const result = transformOrder(makeRaw())
    expect(result.currency).toBe('USD')
  })

  it('maps subtotal cents directly (no conversion)', () => {
    const result = transformOrder(makeRaw({ subtotal: 4999 }))
    expect(result.subtotalPrice?.amount).toBe(4999)
    expect(result.subtotalPrice?.currency).toBe('USD')
  })

  it('maps tax cents directly', () => {
    const result = transformOrder(makeRaw({ tax: 400 }))
    expect(result.totalTax?.amount).toBe(400)
  })

  it('maps total cents directly', () => {
    const result = transformOrder(makeRaw({ total: 5399 }))
    expect(result.totalPrice?.amount).toBe(5399)
  })

  it('maps paid status to PAID financialStatus', () => {
    const result = transformOrder(makeRaw({ status: 'paid' }))
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps pending status to PENDING financialStatus', () => {
    const result = transformOrder(makeRaw({ status: 'pending' }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps refunded status to REFUNDED financialStatus', () => {
    const result = transformOrder(makeRaw({ status: 'refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('includes first_order_item as a lineItem', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.title).toBe('Digital Toolkit')
    expect(result.lineItems?.[0]?.price.amount).toBe(4999)
  })

  it('maps line item productId and variantId', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems?.[0]?.productId).toBe('200')
    expect(result.lineItems?.[0]?.variantId).toBe('300')
  })

  it('maps created_at to createdAt', () => {
    const result = transformOrder(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('stores id and type in metadata', () => {
    const result = transformOrder(makeRaw())
    const meta = result.metadata as Record<string, unknown>
    expect(meta.id).toBe('ord-100')
    expect(meta.type).toBe('orders')
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
