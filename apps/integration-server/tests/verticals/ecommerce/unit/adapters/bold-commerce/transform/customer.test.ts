import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/bold-commerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

describe('transformCustomer (bold-commerce)', () => {
  const raw: RawShopifyCustomer = {
    id: 101,
    email: 'test@example.com',
    first_name: 'Alice',
    last_name: 'Smith',
    phone: '+1-555-1234',
    accepts_marketing: true,
    orders_count: 3,
    total_spent: '199.99',
    currency: 'USD',
    tags: 'vip, loyal',
    default_address: {
      address1: '123 Main St',
      address2: 'Apt 4',
      city: 'Springfield',
      province: 'IL',
      zip: '62701',
      country_code: 'US',
    },
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    expect(transformCustomer(raw).id).toBe('101')
  })

  it('maps email correctly', () => {
    expect(transformCustomer(raw).email).toBe('test@example.com')
  })

  it('maps first and last name', () => {
    const result = transformCustomer(raw)
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Smith')
  })

  it('converts total_spent string to minor units', () => {
    // 199.99 USD → 19999 cents
    const result = transformCustomer(raw)
    expect(result.totalSpent?.amount).toBe(19999)
    expect(result.totalSpent?.currency).toBe('USD')
  })

  it('splits comma-separated tags', () => {
    const result = transformCustomer(raw)
    expect(result.tags).toEqual(['vip', 'loyal'])
  })

  it('maps default address fields', () => {
    const result = transformCustomer(raw)
    expect(result.defaultAddress?.line1).toBe('123 Main St')
    expect(result.defaultAddress?.city).toBe('Springfield')
    expect(result.defaultAddress?.country).toBe('US')
  })

  it('passes CustomerSchema validation', () => {
    const result = transformCustomer(raw)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles null email gracefully', () => {
    const result = transformCustomer({ ...raw, email: null })
    expect(result.email).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing total_spent', () => {
    const result = transformCustomer({ ...raw, total_spent: undefined })
    expect(result.totalSpent).toBeUndefined()
  })
})

describe('untransformCustomer (bold-commerce)', () => {
  it('round-trips email and names', () => {
    const canonical = transformCustomer({
      id: 1,
      email: 'a@b.com',
      first_name: 'Bob',
      last_name: 'Jones',
    })
    const body = untransformCustomer(canonical)
    expect(body.email).toBe('a@b.com')
    expect(body.first_name).toBe('Bob')
    expect(body.last_name).toBe('Jones')
  })

  it('joins tags into comma-separated string', () => {
    const canonical = transformCustomer({
      id: 2,
      tags: 'a, b, c',
    })
    const body = untransformCustomer(canonical)
    expect(body.tags).toBe('a, b, c')
  })
})
