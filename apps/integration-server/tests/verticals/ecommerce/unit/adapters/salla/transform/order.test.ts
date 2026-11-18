import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawSallaOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/salla/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawSallaOrder> = {}): RawSallaOrder {
  return {
    id: 8001,
    reference_id: 'REF-8001',
    currency: 'SAR',
    status: { id: 1, name: 'Paid', slug: 'paid' },
    amounts: {
      sub_total: { amount: 100.0, currency: 'SAR' },
      shipping_cost: { amount: 20.0, currency: 'SAR' },
      tax: { percent: 15, amount: { amount: 15.0, currency: 'SAR' } },
      discounts: [{ amount: { amount: 10.0, currency: 'SAR' }, name: 'SAVE10' }],
      total: { amount: 125.0, currency: 'SAR' },
    },
    customer: {
      id: 3001,
      first_name: 'Fatima',
      last_name: 'Al-Rashid',
      mobile: '501234567',
      email: 'fatima@example.sa',
    },
    items: [
      {
        id: 401,
        name: 'Jasmine Tea',
        quantity: 2,
        sku: 'TEA-JAS-100G',
        product: { id: 1234 },
        unit_price: { amount: 50.0, currency: 'SAR' },
      },
    ],
    shipping: {
      company: 'DHL',
      address: {
        city: 'Riyadh',
        country: 'Saudi Arabia',
        country_code: 'SA',
        street: 'King Fahd Road',
        postal_code: '12345',
      },
    },
    coupon: { code: 'SAVE10' },
    date: { date: '2024-05-01 10:00:00', timezone: 'Asia/Riyadh' },
    updated_at: { date: '2024-05-02 08:00:00', timezone: 'Asia/Riyadh' },
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('8001')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('REF-8001')
    expect(result.currency).toBe('SAR')
    expect(result.customerId).toBe('3001')
    expect(result.email).toBe('fatima@example.sa')
  })

  it('converts money amounts to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 12500, currency: 'SAR' })
    expect(result.subtotalPrice).toEqual({ amount: 10000, currency: 'SAR' })
    expect(result.totalTax).toEqual({ amount: 1500, currency: 'SAR' })
    expect(result.totalShipping).toEqual({ amount: 2000, currency: 'SAR' })
  })

  it('maps paid status to PAID financialStatus', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps line items with minor-unit prices', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('401')
    expect(li.title).toBe('Jasmine Tea')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 5000, currency: 'SAR' })
    expect(li.productId).toBe('1234')
  })

  it('maps discount codes from coupon', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE10'])
  })

  it('maps total discounts from amounts.discounts sum', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalDiscounts).toEqual({ amount: 1000, currency: 'SAR' })
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress?.city).toBe('Riyadh')
    expect(result.shippingAddress?.country).toBe('SA')
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

  it('round-trips via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw.currency).toBe('SAR')
    expect(raw.email).toBe('fatima@example.sa')
  })
})
