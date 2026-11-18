import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type DrupalOrder,
  type DrupalOrderItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/drupal-commerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeOrderItem(overrides: Partial<DrupalOrderItem['attributes']> = {}): DrupalOrderItem {
  return {
    type: 'commerce_order_item--default',
    id: 'item-uuid-001',
    attributes: {
      title: 'Blue T-Shirt - Medium',
      quantity: '2',
      unit_price: { number: '29.99', currency_code: 'USD' },
      total_price: { number: '59.98', currency_code: 'USD' },
      overridden_unit_price: false,
      ...overrides,
    },
    relationships: {
      purchased_entity: {
        data: { type: 'commerce_product_variation--default', id: 'var-uuid-001' },
      },
    },
  }
}

function makeOrder(overrides: Partial<DrupalOrder['attributes']> = {}): DrupalOrder {
  return {
    type: 'commerce_order--default',
    id: 'order-uuid-001',
    attributes: {
      order_number: '10042',
      state: 'fulfillment',
      total_price: { number: '69.98', currency_code: 'USD' },
      total_paid: { number: '69.98', currency_code: 'USD' },
      mail: 'customer@example.com',
      placed: 1717200000,
      completed: null,
      changed: 1717286400,
      ...overrides,
    },
    relationships: {
      uid: {
        data: { type: 'user--user', id: 'user-uuid-001' },
      },
      order_items: {
        data: [{ type: 'commerce_order_item--default', id: 'item-uuid-001' }],
      },
    },
  }
}

// ── transformOrder ────────────────────────────────────────────────────────────

describe('transformOrder (Drupal Commerce)', () => {
  it('maps core order fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('order-uuid-001')
    expect(result.orderNumber).toBe('10042')
    expect(result.name).toBe('#10042')
    expect(result.email).toBe('customer@example.com')
    expect(result.currency).toBe('USD')
  })

  it('maps total price', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 6998, currency: 'USD' })
  })

  it('maps fulfillment state to PAID financial status', () => {
    const result = transformOrder(makeOrder({ state: 'fulfillment' }))
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps draft state to PENDING financial status', () => {
    const result = transformOrder(makeOrder({ state: 'draft' }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps completed state to PAID financial status', () => {
    const result = transformOrder(makeOrder({ state: 'completed' }))
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps canceled state to VOIDED financial status', () => {
    const result = transformOrder(makeOrder({ state: 'canceled' }))
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('maps draft state to UNFULFILLED fulfillment status', () => {
    const result = transformOrder(makeOrder({ state: 'draft' }))
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps fulfillment state to PARTIAL fulfillment status', () => {
    const result = transformOrder(makeOrder({ state: 'fulfillment' }))
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps completed state to FULFILLED fulfillment status', () => {
    const result = transformOrder(makeOrder({ state: 'completed' }))
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps customer ID from relationships', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('user-uuid-001')
  })

  it('maps processedAt from placed timestamp', () => {
    const result = transformOrder(makeOrder())
    expect(result.processedAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('maps updatedAt from changed timestamp', () => {
    const result = transformOrder(makeOrder())
    expect(result.updatedAt).toBe('2024-06-02T00:00:00.000Z')
  })

  it('sets cancelledAt for canceled orders', () => {
    const result = transformOrder(makeOrder({ state: 'canceled', changed: 1717300000 }))
    expect(result.cancelledAt).toBeDefined()
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('does not set cancelledAt for non-canceled orders', () => {
    const result = transformOrder(makeOrder({ state: 'fulfillment' }))
    expect(result.cancelledAt).toBeUndefined()
  })

  it('maps included line items', () => {
    const item = makeOrderItem()
    const result = transformOrder(makeOrder(), [item])
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('item-uuid-001')
    expect(li.title).toBe('Blue T-Shirt - Medium')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(li.variantId).toBe('var-uuid-001')
  })

  it('handles fractional quantity in line items', () => {
    const item = makeOrderItem({ quantity: '1.5' })
    const result = transformOrder(makeOrder(), [item])
    // Rounds to nearest integer
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('handles missing mail gracefully', () => {
    const result = transformOrder(makeOrder({ mail: null }))
    expect(result.email).toBeUndefined()
  })

  it('handles numeric order_number', () => {
    const result = transformOrder(makeOrder({ order_number: 99 }))
    expect(result.orderNumber).toBe('99')
    expect(result.name).toBe('#99')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder(), [makeOrderItem()])
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

// ── untransformOrder ──────────────────────────────────────────────────────────

describe('untransformOrder (Drupal Commerce)', () => {
  it('produces JSON:API body with correct type', () => {
    const body = untransformOrder({ email: 'new@example.com' }) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(body.data.type).toBe('commerce_order--default')
    expect(body.data.attributes['mail']).toBe('new@example.com')
  })

  it('omits email when not provided', () => {
    const body = untransformOrder({}) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['mail']).toBeUndefined()
  })
})
