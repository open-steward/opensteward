import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawRevelOrder,
  type RawRevelOrderItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/revel/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrderItem(overrides: Partial<RawRevelOrderItem> = {}): RawRevelOrderItem {
  return {
    id: 1001,
    product: '/resources/Product/101/',
    product_name_override: 'Espresso',
    price: 4.5,
    quantity: 2,
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RawRevelOrder> = {}): RawRevelOrder {
  return {
    id: 300,
    order_number: 'ORD-001',
    customer: '/resources/Customer/200/',
    final_total: 12.5,
    subtotal: 9.0,
    tax: 1.5,
    discount_total: 2.0,
    closed: false,
    voided: false,
    notes: 'Extra hot',
    orderitems: [makeOrderItem()],
    created_date: '2024-04-01T12:00:00Z',
    updated_date: '2024-04-01T12:30:00Z',
    ...overrides,
  }
}

describe('transformOrder (Revel)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('300')
    expect(result.orderNumber).toBe('ORD-001')
    expect(result.name).toBe('#ORD-001')
    expect(result.customerId).toBe('200')
    expect(result.currency).toBe('USD')
    expect(result.note).toBe('Extra hot')
  })

  it('maps financial totals', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 1250, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 900, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 150, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 200, currency: 'USD' })
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('1001')
    expect(li.productId).toBe('101')
    expect(li.title).toBe('Espresso')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 450, currency: 'USD' })
  })

  it('maps financial status for open orders', () => {
    const result = transformOrder(makeOrder({ closed: false, voided: false }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps financial status for closed orders', () => {
    const result = transformOrder(makeOrder({ closed: true }))
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps financial status for voided orders', () => {
    const result = transformOrder(makeOrder({ voided: true }))
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('maps fulfillment status', () => {
    const open = transformOrder(makeOrder({ closed: false }))
    expect(open.fulfillmentStatus).toBe('UNFULFILLED')
    const closed = transformOrder(makeOrder({ closed: true }))
    expect(closed.fulfillmentStatus).toBe('FULFILLED')
  })

  it('sets cancelledAt for voided orders', () => {
    const result = transformOrder(makeOrder({ voided: true, updated_date: '2024-04-02T00:00:00Z' }))
    expect(result.cancelledAt).toBe('2024-04-02T00:00:00Z')
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

  it('handles missing optional fields', () => {
    const minimal: RawRevelOrder = { id: 999 }
    const result = transformOrder(minimal)
    expect(result.id).toBe('999')
    expect(result.financialStatus).toBe('PENDING')
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (Revel)', () => {
  it('maps notes', () => {
    const raw = untransformOrder({ note: 'Test note' })
    expect(raw['notes']).toBe('Test note')
  })

  it('maps line items with resource URIs', () => {
    const raw = untransformOrder({
      lineItems: [
        { id: '1', variantId: '42', title: 'Coffee', quantity: 1, price: { amount: 3, currency: 'USD' }, metadata: {} },
      ],
    })
    const items = raw['orderitems'] as Array<Record<string, unknown>>
    expect(items).toHaveLength(1)
    expect(items[0]!['product']).toBe('/resources/Product/42/')
    expect(items[0]!['quantity']).toBe(1)
  })
})
