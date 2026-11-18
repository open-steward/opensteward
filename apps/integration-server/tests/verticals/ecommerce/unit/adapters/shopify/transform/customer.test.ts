import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopify/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawShopifyCustomer> = {}): RawShopifyCustomer {
  return {
    id: 7001,
    email: 'ada@example.com',
    first_name: 'Ada',
    last_name: 'Lovelace',
    phone: '+1 555 000 1111',
    accepts_marketing: true,
    orders_count: 4,
    total_spent: '420.50',
    currency: 'USD',
    tags: 'vip, early-access',
    default_address: {
      address1: '1 Programming Ln',
      city: 'London',
      zip: 'NW1 2AB',
      country: 'United Kingdom',
      country_code: 'GB',
      province: 'England',
    },
    addresses: [
      {
        address1: '1 Programming Ln',
        city: 'London',
        zip: 'NW1 2AB',
        country: 'United Kingdom',
        country_code: 'GB',
      },
    ],
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('7001')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.ordersCount).toBe(4)
    expect(result.totalSpent).toEqual({ amount: 42050, currency: 'USD' })
  })

  it('splits tags and maps addresses', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.tags).toEqual(['vip', 'early-access'])
    expect(result.defaultAddress?.line1).toBe('1 Programming Ln')
    expect(result.defaultAddress?.country).toBe('GB')
    expect(result.addresses).toHaveLength(1)
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
    expect(raw.email).toBe('ada@example.com')
    expect(raw.first_name).toBe('Ada')
    expect(raw.last_name).toBe('Lovelace')
    expect(raw.tags).toBe('vip, early-access')
  })
})
