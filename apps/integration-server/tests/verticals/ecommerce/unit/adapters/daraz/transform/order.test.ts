import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawDarazOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/daraz/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawDarazOrder> = {}): RawDarazOrder {
  return {
    order_id: 987654321,
    order_number: 'ORD-1001',
    customer_first_name: 'Ali',
    customer_last_name: 'Khan',
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
        shop_sku: 'EARBUDS-BLK-PK',
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
      first_name: 'Ali',
      last_name: 'Khan',
      address1: '123 Mall Road',
      city: 'Lahore',
      post_code: '54000',
      country: 'PK',
      phone: '+923001234567',
    },
    ...overrides,
  }
}

describe('transformOrder (Daraz)', () => {
  it('maps core fields and uses order_id as the canonical id', () => {
    const result = transformOrder(makeRaw(), 'PKR')
    expect(result.id).toBe('987654321')
    expect(result.orderNumber).toBe('ORD-1001')
    expect(result.name).toBe('ORD-1001')
    expect(result.currency).toBe('PKR')
    expect(result.totalPrice).toEqual({ amount: 5998, currency: 'PKR' })
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'PKR' })
    expect(result.totalDiscounts).toEqual({ amount: 1000, currency: 'PKR' })
  })

  it('maps delivered status correctly', () => {
    const result = transformOrder(makeRaw(), 'PKR')
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('hydrates line items with parsed prices', () => {
    const result = transformOrder(makeRaw(), 'PKR')
    expect(result.lineItems).toHaveLength(2)
    const li = result.lineItems![0]!
    expect(li.id).toBe('111')
    expect(li.sku).toBe('EARBUDS-BLK')
    expect(li.title).toBe('Wireless Bluetooth Earbuds (Black)')
    expect(li.quantity).toBe(1)
    expect(li.price).toEqual({ amount: 2999, currency: 'PKR' })
    expect(li.totalDiscount).toEqual({ amount: 500, currency: 'PKR' })
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeRaw(), 'PKR')
    expect(result.shippingAddress).toMatchObject({
      line1: '123 Mall Road',
      city: 'Lahore',
      postalCode: '54000',
      country: 'PK',
    })
  })

  it('sets cancelledAt for cancelled orders', () => {
    const result = transformOrder(
      makeRaw({ statuses: ['cancelled'], updated_at: '2024-07-02T00:00:00Z' }),
      'PKR',
    )
    expect(result.cancelledAt).toBe('2024-07-02T00:00:00Z')
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeRaw(), 'PKR')
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRaw()
    const result = transformOrder(raw, 'PKR')
    expect(result.metadata).toBe(raw)
  })

  it('handles orders with no line items', () => {
    const result = transformOrder(makeRaw({ order_items: [] }), 'PKR')
    expect(result.lineItems).toBeUndefined()
  })

  it('handles orders with no shipping address', () => {
    const result = transformOrder(makeRaw({ address_shipping: undefined }), 'PKR')
    expect(result.shippingAddress).toBeUndefined()
  })

  it('uses USD as default currency', () => {
    const result = transformOrder(makeRaw())
    expect(result.currency).toBe('USD')
  })
})

describe('mapFinancialStatus (Daraz)', () => {
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

describe('mapFulfillmentStatus (Daraz)', () => {
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
