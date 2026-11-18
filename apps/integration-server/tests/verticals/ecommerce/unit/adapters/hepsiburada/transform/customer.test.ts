import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawWooCommerceCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/hepsiburada/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<RawWooCommerceCustomer> = {}): RawWooCommerceCustomer {
  return {
    id: 77,
    email: 'ali@example.com.tr',
    first_name: 'Ali',
    last_name: 'Yilmaz',
    username: 'ali_y',
    role: 'customer',
    billing: {
      first_name: 'Ali',
      last_name: 'Yilmaz',
      address_1: 'Ataturk Cad. No:1',
      address_2: 'Kat:3',
      city: 'Istanbul',
      state: 'Istanbul',
      postcode: '34000',
      country: 'TR',
      email: 'ali@example.com.tr',
      phone: '+90-212-000-0001',
    },
    shipping: {
      address_1: 'Ataturk Cad. No:1',
      city: 'Istanbul',
      state: 'Istanbul',
      postcode: '34000',
      country: 'TR',
    },
    is_paying_customer: true,
    orders_count: 4,
    total_spent: '850.00',
    date_created: '2024-03-01T00:00:00Z',
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_modified: '2024-03-01T00:00:00Z',
    date_modified_gmt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (hepsiburada / WooCommerce)', () => {
  it('maps id, email, firstName, lastName', () => {
    const result = transformCustomer(makeRaw())
    expect(result.id).toBe('77')
    expect(result.email).toBe('ali@example.com.tr')
    expect(result.firstName).toBe('Ali')
    expect(result.lastName).toBe('Yilmaz')
  })

  it('takes phone from billing.phone', () => {
    const result = transformCustomer(makeRaw())
    expect(result.phone).toBe('+90-212-000-0001')
  })

  it('converts total_spent to minor units (USD default)', () => {
    const result = transformCustomer(makeRaw())
    // 850.00 → 85000 cents
    expect(result.totalSpent).toEqual({ amount: 85000, currency: 'USD' })
  })

  it('maps ordersCount', () => {
    const result = transformCustomer(makeRaw())
    expect(result.ordersCount).toBe(4)
  })

  it('maps defaultAddress from billing', () => {
    const result = transformCustomer(makeRaw())
    expect(result.defaultAddress).toMatchObject({
      line1: 'Ataturk Cad. No:1',
      city: 'Istanbul',
      postalCode: '34000',
      country: 'TR',
    })
  })

  it('maps createdAt from date_created_gmt', () => {
    const result = transformCustomer(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    expect(() => CustomerSchema.parse(transformCustomer(makeRaw()))).not.toThrow()
  })

  it('round-trips email and name via untransformCustomer', () => {
    const body = untransformCustomer(transformCustomer(makeRaw()))
    expect(body['email']).toBe('ali@example.com.tr')
    expect(body['first_name']).toBe('Ali')
    expect(body['last_name']).toBe('Yilmaz')
  })
})
