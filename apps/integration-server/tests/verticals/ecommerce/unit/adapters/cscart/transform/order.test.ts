import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrderStatus,
  type CsCartOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/cscart/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<CsCartOrder> = {}): CsCartOrder {
  return {
    order_id: 456,
    status: 'P',
    total: '59.98',
    subtotal: '50.00',
    tax_subtotal: '5.00',
    shipping_cost: '4.99',
    subtotal_discount: '0.00',
    currency: 'USD',
    user_id: 7,
    email: 'john@example.com',
    firstname: 'John',
    lastname: 'Doe',
    phone: '+1 555 100 2000',
    b_address: '123 Main St',
    b_address_2: 'Apt 4',
    b_city: 'New York',
    b_state: 'NY',
    b_zipcode: '10001',
    b_country: 'US',
    s_address: '456 Ship Ave',
    s_city: 'Brooklyn',
    s_state: 'NY',
    s_zipcode: '11201',
    s_country: 'US',
    products: [
      {
        item_id: 901,
        product_id: 42,
        product: 'Classic Red Shirt',
        amount: 2,
        price: '29.99',
        product_code: 'SHIRT-RED',
      },
    ],
    notes: 'Please leave at door.',
    timestamp: 1704067200,
    ...overrides,
  }
}

describe('transformOrder (CS-Cart)', () => {
  it('maps core fields and stringifies order_id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('456')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('456')
    expect(result.name).toBe('#456')
    expect(result.email).toBe('john@example.com')
    expect(result.phone).toBe('+1 555 100 2000')
    expect(result.currency).toBe('USD')
  })

  it('maps status P → {PAID, UNFULFILLED}', () => {
    const result = transformOrder(makeOrder({ status: 'P' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status C → {PAID, FULFILLED}', () => {
    const result = transformOrder(makeOrder({ status: 'C' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps status O and N → {PENDING, UNFULFILLED}', () => {
    for (const s of ['O', 'N', 'I'] as const) {
      const result = transformOrder(makeOrder({ status: s }))
      expect(result.financialStatus).toBe('PENDING')
      expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    }
  })

  it('maps status F and D → {VOIDED, UNFULFILLED}', () => {
    for (const s of ['F', 'D'] as const) {
      const result = transformOrder(makeOrder({ status: s }))
      expect(result.financialStatus).toBe('VOIDED')
      expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    }
  })

  it('maps status B → {PARTIALLY_PAID, UNFULFILLED}', () => {
    const result = transformOrder(makeOrder({ status: 'B' }))
    expect(result.financialStatus).toBe('PARTIALLY_PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps money fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 5998, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 5000, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 500, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'USD' })
  })

  it('maps billing address with all fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toMatchObject({
      line1: '123 Main St',
      line2: 'Apt 4',
      city: 'New York',
      region: 'NY',
      postalCode: '10001',
      country: 'US',
    })
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toMatchObject({
      line1: '456 Ship Ave',
      city: 'Brooklyn',
      region: 'NY',
      postalCode: '11201',
      country: 'US',
    })
  })

  it('maps line items with unit price and quantity', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('901')
    expect(li.productId).toBe('42')
    expect(li.title).toBe('Classic Red Shirt')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(li.sku).toBe('SHIRT-RED')
  })

  it('maps notes field', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Please leave at door.')
  })

  it('converts Unix timestamp to ISO string', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe(new Date(1704067200 * 1000).toISOString())
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces output that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('untransformOrderStatus returns correct status body', () => {
    expect(untransformOrderStatus('D')).toEqual({ status: 'D' })
    expect(untransformOrderStatus('C')).toEqual({ status: 'C' })
  })

  it('handles missing optional fields gracefully', () => {
    const minimal: CsCartOrder = {
      order_id: 999,
      total: '10.00',
    }
    const result = transformOrder(minimal)
    expect(result.id).toBe('999')
    expect(result.billingAddress).toBeUndefined()
    expect(result.shippingAddress).toBeUndefined()
    expect(result.lineItems).toEqual([])
    expect(result.financialStatus).toBeUndefined()
  })
})
