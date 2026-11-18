import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawMyCashflowCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/mycashflow/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<RawMyCashflowCustomer> = {}): RawMyCashflowCustomer {
  return {
    id: 42,
    email: 'user@example.com',
    first_name: 'Mikael',
    last_name: 'Virtanen',
    phone: '+358501234567',
    addresses: [
      {
        id: 10,
        first_name: 'Mikael',
        last_name: 'Virtanen',
        address: 'Mannerheimintie 1',
        city: 'Helsinki',
        postal_code: '00100',
        country: 'FI',
        phone: '+358501234567',
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-10T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (MyCashflow)', () => {
  it('maps id to string canonical id', () => {
    const result = transformCustomer(makeRaw())
    expect(result.id).toBe('42')
  })

  it('maps email, firstName, lastName', () => {
    const result = transformCustomer(makeRaw())
    expect(result.email).toBe('user@example.com')
    expect(result.firstName).toBe('Mikael')
    expect(result.lastName).toBe('Virtanen')
  })

  it('maps phone from top-level field', () => {
    const result = transformCustomer(makeRaw())
    expect(result.phone).toBe('+358501234567')
  })

  it('maps the first address as defaultAddress', () => {
    const result = transformCustomer(makeRaw())
    expect(result.defaultAddress).toMatchObject({
      line1: 'Mannerheimintie 1',
      city: 'Helsinki',
      postalCode: '00100',
      country: 'FI',
    })
  })

  it('maps addresses array', () => {
    const result = transformCustomer(makeRaw())
    expect(result.addresses).toHaveLength(1)
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformCustomer(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-10T00:00:00Z')
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeRaw())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing addresses gracefully', () => {
    const result = transformCustomer(makeRaw({ addresses: [] }))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
  })
})

describe('untransformCustomer (MyCashflow)', () => {
  it('round-trips email, firstName, lastName, phone', () => {
    const raw = makeRaw()
    const customer = transformCustomer(raw)
    const body = untransformCustomer(customer)
    expect(body['email']).toBe('user@example.com')
    expect(body['first_name']).toBe('Mikael')
    expect(body['last_name']).toBe('Virtanen')
    expect(body['phone']).toBe('+358501234567')
  })
})
