import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/jimdo/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

describe('transformCustomer (jimdo)', () => {
  const raw: RawShopifyCustomer = {
    id: 987654,
    email: 'jane.doe@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+14155550123',
    accepts_marketing: true,
    orders_count: 3,
    total_spent: '79.99',
    currency: 'USD',
    tags: 'vip, wholesale',
    default_address: {
      address1: '123 Main St',
      address2: 'Apt 4B',
      city: 'San Francisco',
      province: 'California',
      province_code: 'CA',
      zip: '94102',
      country: 'United States',
      country_code: 'US',
    },
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformCustomer(raw)
    expect(result.id).toBe('987654')
  })

  it('maps email', () => {
    const result = transformCustomer(raw)
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('maps firstName and lastName', () => {
    const result = transformCustomer(raw)
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('maps totalSpent to minor units', () => {
    const result = transformCustomer(raw)
    // 79.99 USD → 7999 cents
    expect(result.totalSpent).toEqual({ amount: 7999, currency: 'USD' })
  })

  it('splits comma-separated tags', () => {
    const result = transformCustomer(raw)
    expect(result.tags).toEqual(['vip', 'wholesale'])
  })

  it('maps defaultAddress from default_address', () => {
    const result = transformCustomer(raw)
    expect(result.defaultAddress?.line1).toBe('123 Main St')
    expect(result.defaultAddress?.city).toBe('San Francisco')
    expect(result.defaultAddress?.country).toBe('US') // prefers country_code
  })

  it('produces schema-valid output', () => {
    const result = transformCustomer(raw)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles null/missing optional fields', () => {
    const result = transformCustomer({
      id: 1,
      email: null,
      first_name: null,
      last_name: null,
      tags: undefined,
    })
    expect(result.email).toBeUndefined()
    expect(result.tags).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const result = transformCustomer(raw)
    const back = untransformCustomer(result)
    expect(back.email).toBe(raw.email)
    expect(back.first_name).toBe(raw.first_name)
    expect(back.last_name).toBe(raw.last_name)
    expect(back.tags).toBe('vip, wholesale')
  })
})
