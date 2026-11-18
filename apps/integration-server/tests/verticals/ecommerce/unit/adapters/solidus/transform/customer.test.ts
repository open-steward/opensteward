import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawSolidusUser,
} from '../../../../../../../src/verticals/ecommerce/adapters/solidus/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeUser(overrides: Partial<RawSolidusUser> = {}): RawSolidusUser {
  return {
    id: 10,
    email: 'bob@example.com',
    first_name: 'Bob',
    last_name: 'Smith',
    created_at: '2024-01-05T09:00:00.000Z',
    updated_at: '2024-03-10T14:00:00.000Z',
    bill_address: {
      id: 1,
      firstname: 'Bob',
      lastname: 'Smith',
      address1: '100 Main St',
      address2: 'Suite 5',
      city: 'Portland',
      state_name: 'Oregon',
      country_iso: 'US',
      zipcode: '97201',
      phone: '+1-555-0300',
    },
    ship_address: {
      id: 2,
      firstname: 'Bob',
      lastname: 'Smith',
      address1: '200 Elm Rd',
      city: 'Portland',
      state_name: 'Oregon',
      country_iso: 'US',
      zipcode: '97202',
    },
    completed_orders: 8,
    ...overrides,
  }
}

describe('transformCustomer (Solidus)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeUser())
    expect(result.id).toBe('10')
    expect(result.email).toBe('bob@example.com')
    expect(result.firstName).toBe('Bob')
    expect(result.lastName).toBe('Smith')
    expect(result.phone).toBe('+1-555-0300')
    expect(result.ordersCount).toBe(8)
  })

  it('maps billing address as default', () => {
    const result = transformCustomer(makeUser())
    expect(result.defaultAddress).toEqual({
      line1: '100 Main St',
      line2: 'Suite 5',
      city: 'Portland',
      region: 'Oregon',
      postalCode: '97201',
      country: 'US',
    })
  })

  it('maps both addresses', () => {
    const result = transformCustomer(makeUser())
    expect(result.addresses).toHaveLength(2)
  })

  it('falls back to ship_address when bill_address is null', () => {
    const result = transformCustomer(makeUser({ bill_address: null }))
    expect(result.defaultAddress?.line1).toBe('200 Elm Rd')
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
    expect(result.firstName).toBe('Bob')
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
    expect(body.user['email']).toBe('bob@example.com')
    expect(body.user['first_name']).toBe('Bob')
    expect(body.user['last_name']).toBe('Smith')
  })
})
