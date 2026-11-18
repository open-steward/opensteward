import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawJumiaOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/jumia/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawJumiaOrder> = {}): RawJumiaOrder {
  return {
    order_id: 'ORD-2024-001',
    order_number: '100001',
    customer_first_name: 'Adebayo',
    customer_last_name: 'Okafor',
    created_at: '2024-06-01T10:00:00Z',
    updated_at: '2024-06-01T14:00:00Z',
    status: 'shipped',
    price: 89999,
    payment_method: 'JumiaPay',
    shipping_fee: 1500,
    voucher: 5000,
    order_items: [
      {
        order_item_id: 'OI-001',
        sku: 'EARBUDS-BLK',
        seller_sku: 'EARBUDS-BLK',
        name: 'Samsung Galaxy Earbuds Pro (Black)',
        paid_price: 44999,
        quantity: 2,
        status: 'shipped',
        product_id: '987654',
      },
    ],
    shipping_address: {
      first_name: 'Adebayo',
      last_name: 'Okafor',
      address1: '15 Admiralty Way',
      address2: 'Lekki Phase 1',
      city: 'Lagos',
      post_code: '100001',
      country: 'NG',
      phone: '+234800000000',
    },
    ...overrides,
  }
}

describe('transformOrder (Jumia)', () => {
  it('uses order_id as the canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ORD-2024-001')
    expect(result.orderNumber).toBe('100001')
  })

  it('maps shipped status to PAID / PARTIAL', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps pending status correctly', () => {
    const result = transformOrder(makeOrder({ status: 'pending' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps delivered status to PAID / FULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'delivered' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps cancelled status to VOIDED / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.cancelledAt).toBe('2024-06-01T14:00:00Z')
  })

  it('maps returned status to REFUNDED / RESTOCKED', () => {
    const result = transformOrder(makeOrder({ status: 'returned' }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps line items with prices', () => {
    const result = transformOrder(makeOrder(), 'NGN')
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('OI-001')
    expect(li.title).toBe('Samsung Galaxy Earbuds Pro (Black)')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 44999, currency: 'NGN' })
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toMatchObject({
      line1: '15 Admiralty Way',
      city: 'Lagos',
      country: 'NG',
    })
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder(), 'NGN')
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('preserves raw payload in metadata', () => {
    const result = transformOrder(makeOrder())
    expect(result.metadata['order_id']).toBe('ORD-2024-001')
    expect(result.metadata['status']).toBe('shipped')
  })

  it('handles orders with no items', () => {
    const result = transformOrder(makeOrder({ order_items: [] }))
    expect(result.lineItems).toBeUndefined()
  })
})

describe('mapFinancialStatus (Jumia)', () => {
  it('returns undefined for orders with no status', () => {
    expect(mapFinancialStatus({ order_id: '1' })).toBeUndefined()
  })

  it('maps processing to PAID', () => {
    expect(mapFinancialStatus({ status: 'processing' })).toBe('PAID')
  })
})

describe('mapFulfillmentStatus (Jumia)', () => {
  it('returns undefined for orders with no status', () => {
    expect(mapFulfillmentStatus({ order_id: '1' })).toBeUndefined()
  })

  it('maps ready_to_ship to PARTIAL', () => {
    expect(mapFulfillmentStatus({ status: 'ready_to_ship' })).toBe('PARTIAL')
  })
})
