import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShopifyOrder,
  type RawShopifyLineItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/shogun/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLineItem(overrides: Partial<RawShopifyLineItem> = {}): RawShopifyLineItem {
  return {
    id: 501,
    product_id: 1,
    variant_id: 101,
    title: 'Wireless Keyboard',
    quantity: 2,
    price: '29.99',
    total_discount: '0.00',
    sku: 'WK-BLK-M',
    fulfillable_quantity: 2,
    fulfillment_status: null,
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RawShopifyOrder> = {}): RawShopifyOrder {
  return {
    id: 1042,
    order_number: 1042,
    name: '#1042',
    customer: { id: 42 },
    email: 'jane.doe@acme.example',
    phone: '+14155550123',
    currency: 'USD',
    subtotal_price: '59.98',
    total_tax: '5.40',
    total_discounts: '0.00',
    total_price: '65.38',
    financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    line_items: [makeLineItem()],
    billing_address: {
      address1: '123 Market St',
      city: 'San Francisco',
      zip: '94103',
      country_code: 'US',
    },
    shipping_address: {
      address1: '456 Mission St',
      city: 'San Francisco',
      zip: '94105',
      country_code: 'US',
    },
    fulfillments: [{ id: 301 }],
    refunds: [{ id: 401 }],
    transactions: [{ id: 201 }],
    discount_codes: [{ code: 'SAVE10' }],
    tags: 'retail, priority',
    note: 'Leave at front desk.',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    processed_at: '2026-01-15T09:30:00.000Z',
    ...overrides,
  }
}

// ── transformOrder ────────────────────────────────────────────────────────────

describe('transformOrder (Shogun)', () => {
  it('maps id as string', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1042')
  })

  it('maps orderNumber and name', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('1042')
    expect(result.name).toBe('#1042')
  })

  it('maps customerId from nested customer', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('42')
  })

  it('maps currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('USD')
  })

  it('maps financial_status paid to PAID', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps fulfillment_status fulfilled to FULFILLED', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('converts totalPrice from major to minor units', () => {
    const result = transformOrder(makeOrder())
    // 65.38 USD → 6538 cents
    expect(result.totalPrice).toEqual({ amount: 6538, currency: 'USD' })
  })

  it('maps line items with price in minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.title).toBe('Wireless Keyboard')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('maps billingAddress and shippingAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toMatchObject({ line1: '123 Market St', country: 'US' })
    expect(result.shippingAddress).toMatchObject({ line1: '456 Mission St', country: 'US' })
  })

  it('maps fulfillmentIds, refundIds, transactionIds', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentIds).toEqual(['301'])
    expect(result.refundIds).toEqual(['401'])
    expect(result.transactionIds).toEqual(['201'])
  })

  it('maps discount codes', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE10'])
  })

  it('splits tags', () => {
    const result = transformOrder(makeOrder())
    expect(result.tags).toEqual(['retail', 'priority'])
  })

  it('maps processedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.processedAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

// ── untransformOrder ──────────────────────────────────────────────────────────

describe('untransformOrder (Shogun)', () => {
  it('maps email, phone, currency, note', () => {
    const body = untransformOrder({ email: 'jane@example.com', phone: '+1555', currency: 'USD', note: 'test' })
    expect(body['email']).toBe('jane@example.com')
    expect(body['currency']).toBe('USD')
    expect(body['note']).toBe('test')
  })

  it('joins tags array into comma string', () => {
    const body = untransformOrder({ tags: ['retail', 'priority'] })
    expect(body['tags']).toBe('retail, priority')
  })
})
