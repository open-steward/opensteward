import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/sellfy/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawShopifyCustomer> = {}): RawShopifyCustomer {
  return {
    id: 456,
    email: 'jane.doe@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+15559876543',
    accepts_marketing: true,
    orders_count: 3,
    total_spent: '50.00',
    currency: 'USD',
    tags: 'loyal, vip',
    default_address: {
      address1: '456 Oak Ave',
      address2: 'Apt 2',
      city: 'Portland',
      province: 'Oregon',
      province_code: 'OR',
      zip: '97201',
      country: 'United States',
      country_code: 'US',
    },
    created_at: '2023-06-15T09:00:00Z',
    updated_at: '2024-01-20T14:30:00Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('456')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('converts total_spent to minor units with currency', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.totalSpent).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps phone and acceptsMarketing', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+15559876543')
    expect(result.acceptsMarketing).toBe(true)
  })

  it('maps ordersCount', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.ordersCount).toBe(3)
  })

  it('splits tags into array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.tags).toEqual(['loyal', 'vip'])
  })

  it('maps default address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toMatchObject({
      line1: '456 Oak Ave',
      line2: 'Apt 2',
      city: 'Portland',
      postalCode: '97201',
      country: 'US',
    })
  })

  it('defaults to USD when currency is missing', () => {
    const raw = makeCustomer({ currency: undefined })
    const result = transformCustomer(raw)
    expect(result.totalSpent?.currency).toBe('USD')
  })

  it('omits totalSpent when total_spent is not set', () => {
    const result = transformCustomer(makeCustomer({ total_spent: undefined }))
    expect(result.totalSpent).toBeUndefined()
  })

  it('maps dates', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2023-06-15T09:00:00Z')
    expect(result.updatedAt).toBe('2024-01-20T14:30:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw.email).toBe('jane.doe@example.com')
    expect(raw.first_name).toBe('Jane')
    expect(raw.last_name).toBe('Doe')
    expect(raw.accepts_marketing).toBe(true)
  })
})
