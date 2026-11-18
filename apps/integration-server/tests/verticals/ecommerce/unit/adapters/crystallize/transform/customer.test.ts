import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawCrystallizeCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/crystallize/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawCrystallizeCustomer> = {}): RawCrystallizeCustomer {
  return {
    identifier: 'cust-001',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '+44 20 7946 0958',
    addresses: [
      {
        type: 'delivery',
        streetNumber: '1',
        street: 'Programming Lane',
        city: 'London',
        state: 'Greater London',
        postalCode: 'NW1 2AB',
        country: 'GB',
        phone: '+44 20 7946 0958',
      },
    ],
    createdAt: '2024-01-15T09:00:00.000Z',
    updatedAt: '2024-02-20T11:30:00.000Z',
    ...overrides,
  }
}

describe('transformCustomer (Crystallize)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('cust-001')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+44 20 7946 0958')
  })

  it('maps addresses', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0]!.line1).toBe('1 Programming Lane')
    expect(result.addresses![0]!.city).toBe('London')
    expect(result.addresses![0]!.country).toBe('GB')
  })

  it('sets defaultAddress from first address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toBeDefined()
    expect(result.defaultAddress!.postalCode).toBe('NW1 2AB')
  })

  it('handles missing addresses', () => {
    const result = transformCustomer(makeCustomer({ addresses: undefined }))
    expect(result.addresses).toBeUndefined()
    expect(result.defaultAddress).toBeUndefined()
  })

  it('handles null fields', () => {
    const result = transformCustomer(makeCustomer({
      firstName: null,
      lastName: null,
      phone: null,
    }))
    expect(result.firstName).toBeUndefined()
    expect(result.lastName).toBeUndefined()
    expect(result.phone).toBeUndefined()
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
    expect(raw['firstName']).toBe('Ada')
    expect(raw['lastName']).toBe('Lovelace')
    expect(raw['email']).toBe('ada@example.com')
  })
})
