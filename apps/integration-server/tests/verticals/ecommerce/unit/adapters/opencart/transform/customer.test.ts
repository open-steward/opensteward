import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawOpenCartCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/opencart/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(
  overrides: Partial<RawOpenCartCustomer> = {},
): RawOpenCartCustomer {
  return {
    customer_id: 101,
    firstname: 'Grace',
    lastname: 'Hopper',
    email: 'grace@example.com',
    telephone: '+1 555 000 2222',
    address_id: 50,
    addresses: [
      {
        address_id: 50,
        firstname: 'Grace',
        lastname: 'Hopper',
        address_1: '1 Navy Yard',
        city: 'Arlington',
        zone: 'Virginia',
        postcode: '22202',
        country: 'US',
      },
      {
        address_id: 51,
        firstname: 'Grace',
        lastname: 'Hopper',
        address_1: '2 Lab Building',
        city: 'Cambridge',
        zone: 'Massachusetts',
        postcode: '02139',
        country: 'US',
      },
    ],
    status: 1,
    date_added: '2023-06-01T00:00:00.000Z',
    date_modified: '2024-01-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformCustomer (OpenCart)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('101')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('grace@example.com')
    expect(result.firstName).toBe('Grace')
    expect(result.lastName).toBe('Hopper')
    expect(result.phone).toBe('+1 555 000 2222')
  })

  it('selects the correct default address by address_id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('1 Navy Yard')
    expect(result.defaultAddress?.country).toBe('US')
  })

  it('maps all addresses', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(2)
    expect(result.addresses![1]!.city).toBe('Cambridge')
  })

  it('falls back to first address when no address_id matches', () => {
    const result = transformCustomer(makeCustomer({ address_id: 999 }))
    expect(result.defaultAddress?.line1).toBe('1 Navy Yard')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const body = untransformCustomer(canonical)
    expect(body['email']).toBe('grace@example.com')
    expect(body['firstname']).toBe('Grace')
    expect(body['lastname']).toBe('Hopper')
    expect(body['telephone']).toBe('+1 555 000 2222')
    const addr = body['address'] as { address_1?: string; country?: string }
    expect(addr.address_1).toBe('1 Navy Yard')
    expect(addr.country).toBe('US')
  })
})
