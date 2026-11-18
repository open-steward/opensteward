import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/transform/customer'
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
    tags: 'vip, loyal',
    default_address: {
      address1: '1 Programming Ln',
      city: 'London',
      zip: 'NW1 2AB',
      country: 'United Kingdom',
      country_code: 'GB',
    },
    addresses: [
      {
        address1: '1 Programming Ln',
        city: 'London',
        zip: 'NW1 2AB',
        country_code: 'GB',
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-10T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (GoDaddy Websites + Commerce / Shopify shapes)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('7001')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+1 555 000 1111')
    expect(result.ordersCount).toBe(4)
    expect(result.acceptsMarketing).toBe(true)
  })

  it('converts totalSpent from major to minor units', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.totalSpent).toEqual({ amount: 42050, currency: 'USD' })
  })

  it('splits tags and maps addresses', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.tags).toEqual(['vip', 'loyal'])
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

  it('round-trips via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const back = untransformCustomer(canonical)
    expect(back.email).toBe('ada@example.com')
    expect(back.first_name).toBe('Ada')
    expect(back.tags).toBe('vip, loyal')
  })
})
