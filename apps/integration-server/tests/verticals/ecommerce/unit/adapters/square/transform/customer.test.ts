import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawSquareCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/square/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawSquareCustomer> = {}): RawSquareCustomer {
  return {
    id: 'CUST_001',
    email_address: 'ada@example.com',
    given_name: 'Ada',
    family_name: 'Lovelace',
    phone_number: '+1 555 000 1111',
    address: {
      address_line_1: '1 Computing Ln',
      locality: 'London',
      postal_code: 'NW1 2AB',
      country: 'GB',
    },
    preferences: { email_unsubscribed: false },
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-03-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (Square)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('CUST_001')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+1 555 000 1111')
  })

  it('maps address fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('1 Computing Ln')
    expect(result.defaultAddress?.city).toBe('London')
    expect(result.defaultAddress?.country).toBe('GB')
  })

  it('maps marketing preferences', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.acceptsMarketing).toBe(true)
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
    expect(raw['email_address']).toBe('ada@example.com')
    expect(raw['given_name']).toBe('Ada')
    expect(raw['family_name']).toBe('Lovelace')
  })
})
