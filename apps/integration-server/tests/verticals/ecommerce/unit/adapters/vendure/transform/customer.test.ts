import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawVendureCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/vendure/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawVendureCustomer> = {}): RawVendureCustomer {
  return {
    id: '42',
    firstName: 'Ada',
    lastName: 'Lovelace',
    emailAddress: 'ada@example.com',
    phoneNumber: '+44-20-7946-0958',
    orders: { totalItems: 5 },
    addresses: [
      {
        id: 'ADDR1',
        streetLine1: '1 Programming Lane',
        city: 'London',
        postalCode: 'NW1 2AB',
        country: { code: 'GB', name: 'United Kingdom' },
        defaultShippingAddress: true,
        defaultBillingAddress: false,
      },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-06-15T12:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Vendure)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('42')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+44-20-7946-0958')
    expect(result.ordersCount).toBe(5)
  })

  it('maps addresses', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0]!.line1).toBe('1 Programming Lane')
    expect(result.addresses![0]!.country).toBe('GB')
  })

  it('maps default address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('1 Programming Lane')
  })

  it('handles missing addresses', () => {
    const result = transformCustomer(makeCustomer({ addresses: undefined }))
    expect(result.addresses).toBeUndefined()
    expect(result.defaultAddress).toBeUndefined()
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
    expect(raw['emailAddress']).toBe('ada@example.com')
    expect(raw['phoneNumber']).toBe('+44-20-7946-0958')
  })
})
