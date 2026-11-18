import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawSpreeUser,
} from '../../../../../../../src/verticals/ecommerce/adapters/spree/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeUser(overrides: Partial<RawSpreeUser> = {}): RawSpreeUser {
  return {
    id: 10,
    email: 'alice@example.com',
    first_name: 'Alice',
    last_name: 'Johnson',
    created_at: '2024-01-05T09:00:00.000Z',
    updated_at: '2024-03-10T14:00:00.000Z',
    bill_address: {
      id: 1,
      firstname: 'Alice',
      lastname: 'Johnson',
      address1: '456 Oak Ave',
      address2: 'Apt 3B',
      city: 'Seattle',
      state_name: 'Washington',
      country_iso: 'US',
      zipcode: '98101',
      phone: '+1-555-0200',
    },
    ship_address: {
      id: 2,
      firstname: 'Alice',
      lastname: 'Johnson',
      address1: '789 Pine St',
      city: 'Seattle',
      state_name: 'Washington',
      country_iso: 'US',
      zipcode: '98102',
    },
    completed_orders: 5,
    ...overrides,
  }
}

describe('transformCustomer (Spree)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeUser())
    expect(result.id).toBe('10')
    expect(result.email).toBe('alice@example.com')
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Johnson')
    expect(result.phone).toBe('+1-555-0200')
    expect(result.ordersCount).toBe(5)
  })

  it('maps billing address as default', () => {
    const result = transformCustomer(makeUser())
    expect(result.defaultAddress).toEqual({
      line1: '456 Oak Ave',
      line2: 'Apt 3B',
      city: 'Seattle',
      region: 'Washington',
      postalCode: '98101',
      country: 'US',
    })
  })

  it('maps both addresses', () => {
    const result = transformCustomer(makeUser())
    expect(result.addresses).toHaveLength(2)
  })

  it('falls back to ship_address when bill_address is null', () => {
    const result = transformCustomer(makeUser({ bill_address: null }))
    expect(result.defaultAddress?.line1).toBe('789 Pine St')
    expect(result.addresses).toHaveLength(1)
  })

  it('handles user with no addresses', () => {
    const result = transformCustomer(
      makeUser({ bill_address: null, ship_address: null }),
    )
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })

  it('falls back to bill_address firstname when first_name missing', () => {
    const result = transformCustomer(makeUser({ first_name: null }))
    expect(result.firstName).toBe('Alice')
  })

  it('preserves metadata', () => {
    const raw = makeUser()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies CustomerSchema', () => {
    const result = transformCustomer(makeUser())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const canonical = transformCustomer(makeUser())
    const body = untransformCustomer(canonical) as { user: Record<string, unknown> }
    expect(body.user['email']).toBe('alice@example.com')
    expect(body.user['first_name']).toBe('Alice')
    expect(body.user['last_name']).toBe('Johnson')
  })
})
