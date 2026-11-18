import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawSquarespaceProfile,
} from '../../../../../../../src/verticals/ecommerce/adapters/squarespace/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeProfile(overrides: Partial<RawSquarespaceProfile> = {}): RawSquarespaceProfile {
  return {
    id: 'profile-abc-123',
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    hasAccount: true,
    isCustomer: true,
    createdOn: '2023-01-01T00:00:00Z',
    address: {
      address1: '1 Programming Ln',
      city: 'London',
      postalCode: 'NW1 2AB',
      countryCode: 'GB',
      state: 'England',
    },
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeProfile())
    expect(result.id).toBe('profile-abc-123')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.createdAt).toBe('2023-01-01T00:00:00Z')
  })

  it('maps address', () => {
    const result = transformCustomer(makeProfile())
    expect(result.defaultAddress?.line1).toBe('1 Programming Ln')
    expect(result.defaultAddress?.city).toBe('London')
    expect(result.defaultAddress?.country).toBe('GB')
    expect(result.addresses).toHaveLength(1)
  })

  it('handles missing address gracefully', () => {
    const result = transformCustomer(makeProfile({ address: null }))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
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

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeProfile())
    const raw = untransformCustomer(canonical)
    expect(raw.email).toBe('ada@example.com')
    expect(raw.firstName).toBe('Ada')
    expect(raw.lastName).toBe('Lovelace')
  })

  it('maps the documented List profiles example (acceptsMarketing, transactionsSummary.orderCount)', () => {
    // https://developers.squarespace.com/commerce-apis/profiles, "List profiles"
    // 200 example; the placeholder "email" is replaced with an address.
    const raw: RawSquarespaceProfile = {
      acceptsMarketing: true,
      address: {
        address1: '459 Broadway',
        address2: 'address2',
        city: 'New York',
        countryCode: 'US',
        firstName: 'Bob',
        lastName: 'Loblaw',
        phone: '5553334444',
        postalCode: '10003',
        state: 'NY',
      },
      createdOn: '2024-08-25T15:00:00Z',
      email: 'bob@example.com',
      firstName: 'firstName',
      hasAccount: true,
      id: 'id',
      isCustomer: true,
      lastName: 'lastName',
      transactionsSummary: {
        donationCount: 0,
        orderCount: 3,
        totalOrderAmount: { currency: 'USD', value: 49.99 },
      },
    }
    const result = CustomerSchema.parse(transformCustomer(raw))
    expect(result.acceptsMarketing).toBe(true)
    expect(result.ordersCount).toBe(3)
    expect(result.defaultAddress).toEqual({
      line1: '459 Broadway',
      line2: 'address2',
      city: 'New York',
      region: 'NY',
      postalCode: '10003',
      country: 'US',
    })
  })

  it('maps an empty email to undefined rather than an empty string', () => {
    const result = transformCustomer(makeProfile({ email: '' }))
    expect(result.email).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('omits ordersCount when transactionsSummary is absent', () => {
    expect(transformCustomer(makeProfile()).ordersCount).toBeUndefined()
  })
})
