import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawSaleorCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/saleor/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawSaleorCustomer> = {}): RawSaleorCustomer {
  return {
    id: 'VXNlcjox',
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    defaultShippingAddress: {
      streetAddress1: '1 Programming Ln',
      streetAddress2: '',
      city: 'London',
      countryArea: '',
      postalCode: 'NW1 2AB',
      country: { code: 'GB' },
    },
    addresses: [
      {
        streetAddress1: '1 Programming Ln',
        city: 'London',
        postalCode: 'NW1 2AB',
        country: { code: 'GB' },
      },
    ],
    dateJoined: '2024-01-15T10:00:00Z',
    updatedAt: '2024-06-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Saleor)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('VXNlcjox')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    // User has no phone, and orders{totalCount} needs MANAGE_STAFF/OWNER
    expect(result.phone).toBeUndefined()
    expect(result.ordersCount).toBeUndefined()
  })

  it('maps default address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('1 Programming Ln')
    expect(result.defaultAddress?.country).toBe('GB')
    // String! address fields come back '' when unset
    expect(result.defaultAddress?.line2).toBeUndefined()
    expect(result.defaultAddress?.region).toBeUndefined()
  })

  it('reads the default address from defaultShippingAddress only, with no fallback', () => {
    const result = transformCustomer(makeCustomer({ defaultShippingAddress: null }))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toHaveLength(1)
  })

  it('treats empty String! address fields as unset', () => {
    const empty = {
      streetAddress1: '',
      streetAddress2: '',
      city: 'London',
      countryArea: '',
      postalCode: '',
      country: { code: '' },
    }
    const result = transformCustomer(makeCustomer({ defaultShippingAddress: empty }))
    expect(result.defaultAddress).toEqual({ city: 'London' })
    expect(
      transformCustomer(makeCustomer({ defaultShippingAddress: { ...empty, city: '' } }))
        .defaultAddress,
    ).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('maps addresses array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0]!.city).toBe('London')
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
    const raw = untransformCustomer(canonical)
    expect(raw['firstName']).toBe('Ada')
    expect(raw['lastName']).toBe('Lovelace')
    expect(raw['email']).toBe('ada@example.com')
  })
})
