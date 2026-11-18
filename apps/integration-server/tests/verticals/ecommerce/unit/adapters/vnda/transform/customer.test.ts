import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawWooCommerceCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/vnda/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawWooCommerceCustomer> = {}): RawWooCommerceCustomer {
  return {
    id: 77,
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    billing: {
      first_name: 'Jane',
      last_name: 'Doe',
      address_1: '123 Main St',
      address_2: 'Apt 4',
      city: 'New York',
      state: 'NY',
      postcode: '10001',
      country: 'US',
      phone: '+14155550123',
    },
    shipping: {
      address_1: '456 Ship Rd',
      city: 'Brooklyn',
      postcode: '11201',
      country: 'US',
    },
    orders_count: 5,
    total_spent: '250.00',
    date_created_gmt: '2026-01-15T09:30:00.000Z',
    date_modified_gmt: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('transformCustomer (VNDA/WooCommerce)', () => {
  it('maps id, email, firstName and lastName', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('77')
    expect(result.email).toBe('jane@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('reads phone from billing sub-object', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+14155550123')
  })

  it('maps ordersCount and converts totalSpent to minor units', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(5)
    expect(result.totalSpent).toEqual({ amount: 25000, currency: 'USD' })
  })

  it('maps defaultAddress from billing', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress!.line1).toBe('123 Main St')
    expect(result.defaultAddress!.line2).toBe('Apt 4')
    expect(result.defaultAddress!.city).toBe('New York')
    expect(result.defaultAddress!.region).toBe('NY')
    expect(result.defaultAddress!.postalCode).toBe('10001')
    expect(result.defaultAddress!.country).toBe('US')
  })

  it('includes shipping in addresses array', () => {
    const result = transformCustomer(makeCustomer())
    // billing + shipping = 2 addresses
    expect(result.addresses).toHaveLength(2)
  })

  it('maps timestamps', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updatedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips email via untransformCustomer', () => {
    const customer = transformCustomer(makeCustomer())
    const body = untransformCustomer(customer)
    expect(body['email']).toBe('jane@example.com')
    expect(body['first_name']).toBe('Jane')
    expect(body['last_name']).toBe('Doe')
  })
})
