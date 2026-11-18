import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawYokartCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/yokart/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawYokartCustomer> = {}): RawYokartCustomer {
  return {
    user_id: 7,
    user_email: 'ada@example.com',
    user_firstname: 'Ada',
    user_lastname: 'Lovelace',
    user_mobile: '+44 7700 900001',
    user_created: '2023-01-15T10:00:00Z',
    user_updated: '2024-03-10T08:30:00Z',
    orders_count: 5,
    address: {
      address_address1: '10 Downing St',
      address_city: 'London',
      address_zip: 'SW1A 2AA',
      address_country: 'GB',
    },
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core customer fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('7')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+44 7700 900001')
  })

  it('maps ordersCount as integer from number', () => {
    const result = transformCustomer(makeCustomer({ orders_count: 5 }))
    expect(result.ordersCount).toBe(5)
  })

  it('parses ordersCount from string via parseInt', () => {
    const result = transformCustomer(makeCustomer({ orders_count: '12' }))
    expect(result.ordersCount).toBe(12)
  })

  it('maps timestamps to ISO strings', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBeTruthy()
    expect(result.updatedAt).toBeTruthy()
  })

  it('maps default address using address_ prefixed fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('10 Downing St')
    expect(result.defaultAddress?.city).toBe('London')
    expect(result.defaultAddress?.postalCode).toBe('SW1A 2AA')
    expect(result.defaultAddress?.country).toBe('GB')
  })

  it('falls back to user_phone when user_mobile is absent', () => {
    const result = transformCustomer(
      makeCustomer({ user_mobile: undefined, user_phone: '+1 555 0100' }),
    )
    expect(result.phone).toBe('+1 555 0100')
  })

  it('returns no defaultAddress when address has no meaningful fields', () => {
    const result = transformCustomer(makeCustomer({ address: null }))
    expect(result.defaultAddress).toBeUndefined()
  })

  it('collects addresses array when multiple are provided', () => {
    const result = transformCustomer(
      makeCustomer({
        addresses: [
          {
            address_address1: '2nd Ave',
            address_city: 'New York',
            address_zip: '10001',
            address_country: 'US',
          },
        ],
      }),
    )
    // default address + extra addresses
    expect(result.addresses!.length).toBeGreaterThanOrEqual(1)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw['user_email']).toBe('ada@example.com')
    expect(raw['user_firstname']).toBe('Ada')
    expect(raw['user_lastname']).toBe('Lovelace')
    expect(raw['user_mobile']).toBe('+44 7700 900001')
  })

  it('untransformCustomer maps default address back', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw['address_address1']).toBe('10 Downing St')
    expect(raw['address_city']).toBe('London')
    expect(raw['address_country']).toBe('GB')
  })
})
