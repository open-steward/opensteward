import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawRechargeCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/recharge/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawRechargeCustomer> = {}): RawRechargeCustomer {
  return {
    id: 9001,
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+15550001234',
    accepts_marketing: true,
    orders_count: 7,
    total_spent: '350.00',
    status: 'ACTIVE',
    billing_address: {
      address1: '10 Baker St',
      city: 'London',
      zip: 'NW1 6XE',
      country_code: 'GB',
      province: 'England',
    },
    created_at: '2023-06-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('9001')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('jane@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.phone).toBe('+15550001234')
  })

  it('converts total_spent to minor units', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.totalSpent).toEqual({ amount: 35000, currency: 'USD' })
  })

  it('maps billing_address to defaultAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('10 Baker St')
    expect(result.defaultAddress?.city).toBe('London')
    expect(result.defaultAddress?.country).toBe('GB')
    expect(result.defaultAddress?.region).toBe('England')
  })

  it('includes billing address in addresses array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toBeDefined()
    expect(result.addresses!.length).toBeGreaterThanOrEqual(1)
  })

  it('also includes extra addresses when provided', () => {
    const result = transformCustomer(
      makeCustomer({
        addresses: [{ address1: '5 Main St', city: 'Paris', country_code: 'FR' }],
      }),
    )
    // billing + 1 extra
    expect(result.addresses!.length).toBe(2)
  })

  it('handles numeric total_spent', () => {
    const result = transformCustomer(makeCustomer({ total_spent: 100 }))
    expect(result.totalSpent).toEqual({ amount: 10000, currency: 'USD' })
  })

  it('omits totalSpent when absent', () => {
    const result = transformCustomer(makeCustomer({ total_spent: null }))
    expect(result.totalSpent).toBeUndefined()
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
  })
})
