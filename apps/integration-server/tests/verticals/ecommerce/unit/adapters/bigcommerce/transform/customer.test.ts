import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawBigCommerceCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/bigcommerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawBigCommerceCustomer> = {}): RawBigCommerceCustomer {
  return {
    id: 100,
    email: 'ada@example.com',
    first_name: 'Ada',
    last_name: 'Lovelace',
    phone: '+1 555 000 1111',
    addresses: [
      {
        address1: '1 Programming Ln',
        city: 'London',
        postal_code: 'NW1 2AB',
        country: 'United Kingdom',
        country_code: 'GB',
        state_or_province: 'England',
      },
    ],
    date_created: '2023-01-01T00:00:00Z',
    date_modified: '2024-02-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('100')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+1 555 000 1111')
  })

  it('maps addresses and uses first as default', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('1 Programming Ln')
    expect(result.defaultAddress?.country).toBe('GB')
    expect(result.addresses).toHaveLength(1)
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
    expect(raw.email).toBe('ada@example.com')
    expect(raw.first_name).toBe('Ada')
    expect(raw.last_name).toBe('Lovelace')
  })
})
