import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawWooCommerceCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/gambio/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawWooCommerceCustomer> = {}): RawWooCommerceCustomer {
  return {
    id: 42,
    email: 'ada@example.com',
    first_name: 'Ada',
    last_name: 'Lovelace',
    orders_count: 5,
    total_spent: '349.95',
    billing: {
      address_1: '1 Programming Ln',
      city: 'London',
      postcode: 'EC1A 1BB',
      country: 'GB',
      phone: '+44 20 7946 0958',
    },
    shipping: {
      address_1: '2 Shipping Rd',
      city: 'Manchester',
      postcode: 'M1 1AA',
      country: 'GB',
    },
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_modified_gmt: '2024-03-10T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Gambio / WooCommerce)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('42')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.ordersCount).toBe(5)
  })

  it('converts totalSpent from major to minor units (hardcoded USD)', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.totalSpent).toEqual({ amount: 34995, currency: 'USD' })
  })

  it('picks phone from billing sub-object', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+44 20 7946 0958')
  })

  it('maps billing as defaultAddress and both as addresses', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('1 Programming Ln')
    expect(result.defaultAddress?.country).toBe('GB')
    // Both billing and shipping are different objects → 2 addresses
    expect(result.addresses).toHaveLength(2)
  })

  it('maps timestamps from GMT fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-10T00:00:00Z')
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
    const back = untransformCustomer(canonical)
    expect(back.email).toBe('ada@example.com')
    expect(back.first_name).toBe('Ada')
    expect(back.last_name).toBe('Lovelace')
  })
})
