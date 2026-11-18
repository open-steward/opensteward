import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawTokopediaOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/tokopedia/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawTokopediaOrder> = {}): RawTokopediaOrder {
  return {
    order_id: 123456789,
    invoice_ref_num: 'INV/20240501/TKP/123456789',
    order_status: 500,
    buyer_id: 88888,
    buyer: {
      id: 88888,
      name: 'Ahmad Buyer',
      email: 'ahmad@example.com',
      phone: '+628123456789',
    },
    products: [
      {
        id: 987654321,
        name: 'Batik Silk Shirt',
        sku: 'BSS-001',
        quantity: 2,
        price: 350000,
        total_price: 700000,
        weight: 200,
        currency: 'IDR',
      },
    ],
    recipient: {
      name: 'Ahmad Buyer',
      phone: '+628123456789',
      address: {
        address_full: 'Jl. Sudirman No. 123, Jakarta Selatan',
        city: 'Jakarta Selatan',
        district: 'Setiabudi',
        province: 'DKI Jakarta',
        postal_code: '12920',
        country: 'ID',
      },
    },
    shipment_fulfillment: {
      sp_id: 1,
      logistic_name: 'GoSend',
      logistic_service: 'Same Day',
      shipping_price: 20000,
      awb: 'GS-12345678',
    },
    amt: {
      ttl_product_price: 700000,
      shipping_cost: 20000,
      insurance_cost: 5000,
      total_amount: 725000,
      discount: 0,
      ttl_amount: 725000,
    },
    payment: {
      payment_ref_num: 'PAY-123456',
      payment_date: '2024-05-01T12:05:00.000Z',
      payment_method: 'GoPay',
    },
    create_time: '2024-05-01T12:00:00.000Z',
    update_time: '2024-05-01T14:00:00.000Z',
    payment_date: '2024-05-01T12:05:00.000Z',
    shop_id: 11223344,
    ...overrides,
  }
}

describe('transformOrder (Tokopedia)', () => {
  it('uses order_id as the canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('123456789')
    expect(result.orderNumber).toBe('INV/20240501/TKP/123456789')
    expect(result.name).toBe('INV/20240501/TKP/123456789')
  })

  it('maps total amounts', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 725000, currency: 'IDR' })
    expect(result.totalShipping).toEqual({ amount: 20000, currency: 'IDR' })
    expect(result.currency).toBe('IDR')
  })

  it('maps status 500 (shipped) to PAID + PARTIAL', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps status 700 (completed) to PAID + FULFILLED', () => {
    const result = transformOrder(makeOrder({ order_status: 700 }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('hydrates line items with unit price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('987654321')
    expect(li.productId).toBe('987654321')
    expect(li.title).toBe('Batik Silk Shirt')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 350000, currency: 'IDR' })
    expect(li.sku).toBe('BSS-001')
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      line1: 'Jl. Sudirman No. 123, Jakarta Selatan',
      city: 'Jakarta Selatan',
      region: 'DKI Jakarta',
      postalCode: '12920',
      country: 'ID',
    })
  })

  it('maps processedAt from payment_date', () => {
    const result = transformOrder(makeOrder())
    expect(result.processedAt).toBe('2024-05-01T12:05:00.000Z')
  })

  it('preserves timestamps', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-05-01T12:00:00.000Z')
    expect(result.updatedAt).toBe('2024-05-01T14:00:00.000Z')
  })

  it('satisfies OrderSchema and preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })

  it('maps cancelled order (status 0)', () => {
    const result = transformOrder(
      makeOrder({ order_status: 0 }),
    )
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.cancelledAt).toBeTruthy()
  })

  it('maps pending order (status 100)', () => {
    const result = transformOrder(makeOrder({ order_status: 100 }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('includes totalDiscounts when present', () => {
    const result = transformOrder(makeOrder({
      amt: {
        ttl_product_price: 700000,
        shipping_cost: 20000,
        insurance_cost: 0,
        total_amount: 670000,
        discount: 50000,
        ttl_amount: 670000,
      },
    }))
    expect(result.totalDiscounts).toEqual({ amount: 50000, currency: 'IDR' })
  })

  it('returns empty lineItems as undefined', () => {
    const result = transformOrder(makeOrder({ products: [] }))
    expect(result.lineItems).toBeUndefined()
  })
})

describe('mapFinancialStatus (Tokopedia)', () => {
  it('maps all known status ranges', () => {
    expect(mapFinancialStatus(0)).toBe('VOIDED')
    expect(mapFinancialStatus(3)).toBe('VOIDED')
    expect(mapFinancialStatus(10)).toBe('VOIDED')
    expect(mapFinancialStatus(100)).toBe('PENDING')
    expect(mapFinancialStatus(220)).toBe('PAID')
    expect(mapFinancialStatus(400)).toBe('PAID')
    expect(mapFinancialStatus(500)).toBe('PAID')
    expect(mapFinancialStatus(700)).toBe('PAID')
  })

  it('returns undefined for undefined input', () => {
    expect(mapFinancialStatus(undefined)).toBeUndefined()
  })
})

describe('mapFulfillmentStatus (Tokopedia)', () => {
  it('maps all known status ranges', () => {
    expect(mapFulfillmentStatus(0)).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus(100)).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus(400)).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus(500)).toBe('PARTIAL')
    expect(mapFulfillmentStatus(600)).toBe('FULFILLED')
    expect(mapFulfillmentStatus(700)).toBe('FULFILLED')
  })

  it('returns undefined for undefined input', () => {
    expect(mapFulfillmentStatus(undefined)).toBeUndefined()
  })
})
