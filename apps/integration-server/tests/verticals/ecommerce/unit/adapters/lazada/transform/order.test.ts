import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawLazadaOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/lazada/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawLazadaOrder> = {}): RawLazadaOrder {
  return {
    order_id: 987654321,
    order_number: 'ORD-1001',
    customer_first_name: 'John',
    customer_last_name: 'Doe',
    created_at: '2024-07-01T09:00:00Z',
    updated_at: '2024-07-01T12:00:00Z',
    statuses: ['delivered'],
    price: '59.98',
    payment_method: 'COD',
    items_count: 2,
    shipping_fee: '5.00',
    voucher: '10.00',
    order_items: [
      {
        order_item_id: 111,
        shop_sku: 'EARBUDS-BLK-SG',
        sku: 'EARBUDS-BLK',
        name: 'Wireless Bluetooth Earbuds (Black)',
        paid_price: '29.99',
        item_price: '29.99',
        tax_amount: '2.10',
        voucher_amount: '5.00',
        quantity: 1,
        status: 'delivered',
        product_id: 123456789,
      },
      {
        order_item_id: 112,
        sku: 'EARBUDS-WHT',
        name: 'Wireless Bluetooth Earbuds (White)',
        paid_price: '29.99',
        quantity: 1,
        status: 'delivered',
        product_id: 123456789,
      },
    ],
    address_shipping: {
      first_name: 'John',
      last_name: 'Doe',
      address1: '123 Orchard Road',
      city: 'Singapore',
      post_code: '238858',
      country: 'SG',
      phone: '+6591234567',
    },
    ...overrides,
  }
}

describe('transformOrder (Lazada)', () => {
  it('maps core fields and uses order_id as the canonical id', () => {
    const result = transformOrder(makeOrder(), 'SGD')
    expect(result.id).toBe('987654321')
    expect(result.orderNumber).toBe('ORD-1001')
    expect(result.name).toBe('ORD-1001')
    expect(result.currency).toBe('SGD')
    expect(result.totalPrice).toEqual({ amount: 5998, currency: 'SGD' })
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'SGD' })
    expect(result.totalDiscounts).toEqual({ amount: 1000, currency: 'SGD' })
  })

  it('maps delivered status correctly', () => {
    const result = transformOrder(makeOrder(), 'SGD')
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('hydrates line items with parsed prices', () => {
    const result = transformOrder(makeOrder(), 'SGD')
    expect(result.lineItems).toHaveLength(2)
    const li = result.lineItems![0]!
    expect(li.id).toBe('111')
    expect(li.sku).toBe('EARBUDS-BLK')
    expect(li.title).toBe('Wireless Bluetooth Earbuds (Black)')
    expect(li.quantity).toBe(1)
    expect(li.price).toEqual({ amount: 2999, currency: 'SGD' })
    expect(li.totalDiscount).toEqual({ amount: 500, currency: 'SGD' })
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder(), 'SGD')
    expect(result.shippingAddress).toMatchObject({
      line1: '123 Orchard Road',
      city: 'Singapore',
      postalCode: '238858',
      country: 'SG',
    })
  })

  it('sets cancelledAt for cancelled orders', () => {
    const result = transformOrder(
      makeOrder({ statuses: ['cancelled'], updated_at: '2024-07-02T00:00:00Z' }),
      'SGD',
    )
    expect(result.cancelledAt).toBe('2024-07-02T00:00:00Z')
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder(), 'SGD')
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw, 'SGD')
    expect(result.metadata).toBe(raw)
  })

  it('handles orders with no line items', () => {
    const result = transformOrder(makeOrder({ order_items: [] }), 'SGD')
    expect(result.lineItems).toBeUndefined()
  })
})

describe('mapFinancialStatus (Lazada)', () => {
  it('maps all known statuses', () => {
    expect(mapFinancialStatus(['pending'])).toBe('PENDING')
    expect(mapFinancialStatus(['packed'])).toBe('PAID')
    expect(mapFinancialStatus(['ready_to_ship'])).toBe('PAID')
    expect(mapFinancialStatus(['shipped'])).toBe('PAID')
    expect(mapFinancialStatus(['delivered'])).toBe('PAID')
    expect(mapFinancialStatus(['returned'])).toBe('REFUNDED')
    expect(mapFinancialStatus(['failed'])).toBe('VOIDED')
    expect(mapFinancialStatus(['cancelled'])).toBe('VOIDED')
  })

  it('returns undefined for empty or unknown statuses', () => {
    expect(mapFinancialStatus(undefined)).toBeUndefined()
    expect(mapFinancialStatus([])).toBeUndefined()
    expect(mapFinancialStatus(['unknown_status'])).toBeUndefined()
  })
})

describe('mapFulfillmentStatus (Lazada)', () => {
  it('maps all known statuses', () => {
    expect(mapFulfillmentStatus(['pending'])).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus(['packed'])).toBe('PARTIAL')
    expect(mapFulfillmentStatus(['ready_to_ship'])).toBe('PARTIAL')
    expect(mapFulfillmentStatus(['shipped'])).toBe('PARTIAL')
    expect(mapFulfillmentStatus(['delivered'])).toBe('FULFILLED')
    expect(mapFulfillmentStatus(['returned'])).toBe('RESTOCKED')
    expect(mapFulfillmentStatus(['cancelled'])).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus(['failed'])).toBe('UNFULFILLED')
  })
})
