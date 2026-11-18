import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type XCartProfile,
} from '../../../../../../../src/verticals/ecommerce/adapters/xcart/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeProfile(overrides: Partial<XCartProfile> = {}): XCartProfile {
  return {
    profile_id: 789,
    email: 'jane.smith@example.com',
    firstname: 'Jane',
    lastname: 'Smith',
    phone: '+1 555 987 6543',
    orders_count: 5,
    total_spent: 299.95,
    billing_address: {
      firstname: 'Jane',
      lastname: 'Smith',
      street: '456 Oak Avenue',
      city: 'Los Angeles',
      state: 'CA',
      zipcode: '90001',
      country: 'US',
      phone: '+1 555 987 6543',
    },
    shipping_address: {
      firstname: 'Jane',
      lastname: 'Smith',
      street: '789 Pine Boulevard',
      city: 'Los Angeles',
      state: 'CA',
      zipcode: '90002',
      country: 'US',
    },
    created: 1640000000, // 2021-12-20T11:33:20Z
    modified: 1704067200, // 2024-01-01T00:00:00Z
    ...overrides,
  }
}

describe('transformCustomer (X-Cart)', () => {
  it('maps core fields and stringifies profile_id', () => {
    const result = transformCustomer(makeProfile())
    expect(result.id).toBe('789')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('jane.smith@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Smith')
    expect(result.phone).toBe('+1 555 987 6543')
  })

  it('maps ordersCount and totalSpent', () => {
    const result = transformCustomer(makeProfile())
    expect(result.ordersCount).toBe(5)
    expect(result.totalSpent).toEqual({ amount: 29995, currency: 'USD' })
  })

  it('maps billing address as defaultAddress', () => {
    const result = transformCustomer(makeProfile())
    expect(result.defaultAddress).toMatchObject({
      line1: '456 Oak Avenue',
      city: 'Los Angeles',
      region: 'CA',
      postalCode: '90001',
      country: 'US',
    })
  })

  it('includes both billing and shipping in addresses', () => {
    const result = transformCustomer(makeProfile())
    expect(result.addresses).toHaveLength(2)
    const cities = result.addresses!.map((a) => a.city)
    expect(cities).toContain('Los Angeles')
  })

  it('converts unix timestamps to ISO strings', () => {
    const result = transformCustomer(makeProfile())
    expect(result.createdAt).toBe('2021-12-20T11:33:20.000Z')
    expect(result.updatedAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('handles missing billing address gracefully', () => {
    const result = transformCustomer(makeProfile({ billing_address: null }))
    expect(result.defaultAddress).toBeUndefined()
  })

  it('includes only shipping when billing is null', () => {
    const result = transformCustomer(
      makeProfile({
        billing_address: null,
      }),
    )
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0]!.postalCode).toBe('90002')
  })

  it('handles empty addresses when both are null', () => {
    const result = transformCustomer(
      makeProfile({ billing_address: null, shipping_address: null }),
    )
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('handles null total_spent gracefully', () => {
    const result = transformCustomer(makeProfile({ total_spent: null }))
    expect(result.totalSpent).toBeUndefined()
  })

  it('handles null orders_count gracefully', () => {
    const result = transformCustomer(makeProfile({ orders_count: null }))
    expect(result.ordersCount).toBeUndefined()
  })

  it('falls back to billing phone when top-level phone is absent', () => {
    const result = transformCustomer(
      makeProfile({
        phone: null,
        billing_address: {
          street: '1 Test St',
          city: 'NY',
          country: 'US',
          phone: '+1 555 111 2222',
        },
      }),
    )
    expect(result.phone).toBe('+1 555 111 2222')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProfile()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeProfile())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles customer with no timestamps', () => {
    const result = transformCustomer(makeProfile({ created: null, modified: null }))
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })
})
