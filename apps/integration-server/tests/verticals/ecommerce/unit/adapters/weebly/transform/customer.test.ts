import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/weebly/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawShopifyCustomer> = {}): RawShopifyCustomer {
  return {
    id: 101,
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+1-555-000-0101',
    accepts_marketing: true,
    orders_count: 2,
    total_spent: '150.00',
    currency: 'USD',
    tags: 'vip,loyal',
    default_address: {
      address1: '1 Main St',
      city: 'NYC',
      zip: '10001',
      country_code: 'US',
      province: 'New York',
    },
    addresses: [
      {
        address1: '1 Main St',
        city: 'NYC',
        zip: '10001',
        country_code: 'US',
      },
    ],
    created_at: '2024-05-01T10:00:00.000Z',
    updated_at: '2024-05-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('101')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('jane@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.ordersCount).toBe(2)
  })

  it('converts total_spent decimal string to minor units', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.totalSpent).toEqual({ amount: 15000, currency: 'USD' })
  })

  it('splits comma-separated tags', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.tags).toEqual(['vip', 'loyal'])
  })

  it('maps default_address using address1/zip/province fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('1 Main St')
    expect(result.defaultAddress?.postalCode).toBe('10001')
    expect(result.defaultAddress?.region).toBe('New York')
    expect(result.defaultAddress?.country).toBe('US')
    expect(result.defaultAddress?.city).toBe('NYC')
  })

  it('maps addresses array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0].line1).toBe('1 Main St')
  })

  it('returns undefined tags when tags string is absent', () => {
    const result = transformCustomer(makeCustomer({ tags: undefined }))
    expect(result.tags).toBeUndefined()
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
    expect(raw.email).toBe('jane@example.com')
    expect(raw.first_name).toBe('Jane')
    expect(raw.last_name).toBe('Doe')
    expect(raw.tags).toBe('vip, loyal')
    expect((raw.addresses as Array<{ address1: string }>)?.[0].address1).toBe('1 Main St')
  })
})
