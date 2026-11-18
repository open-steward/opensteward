import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawThirtyBeesCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/thirty-bees/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(
  overrides: Partial<RawThirtyBeesCustomer> = {},
): RawThirtyBeesCustomer {
  return {
    id: 7001,
    email: 'ada@example.com',
    firstname: 'Ada',
    lastname: 'Lovelace',
    active: 1,
    date_add: '2023-01-01T00:00:00.000Z',
    date_upd: '2024-02-01T00:00:00.000Z',
    _addresses: [
      {
        id: 1,
        id_customer: 7001,
        firstname: 'Ada',
        lastname: 'Lovelace',
        address1: '1 Programming Ln',
        city: 'London',
        postcode: 'NW1 2AB',
        id_country: 17,
        phone_mobile: '+1 555 000 1111',
      },
    ],
    ...overrides,
  }
}

describe('transformCustomer (Thirty Bees)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('7001')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('ada@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.phone).toBe('+1 555 000 1111')
  })

  it('maps first address as the default address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('1 Programming Ln')
    expect(result.defaultAddress?.city).toBe('London')
    expect(result.addresses?.length).toBeGreaterThan(0)
  })

  it('handles customer with no addresses', () => {
    const result = transformCustomer(makeCustomer({ _addresses: [] }))
    expect(result.defaultAddress).toBeUndefined()
    expect(result.addresses).toBeUndefined()
    expect(result.phone).toBeUndefined()
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
    expect(body['email']).toBe('ada@example.com')
    expect(body['firstname']).toBe('Ada')
    expect(body['lastname']).toBe('Lovelace')
    expect(body['active']).toBe(1)
  })

  it('falls back to phone when phone_mobile is not set', () => {
    const result = transformCustomer(
      makeCustomer({
        _addresses: [
          {
            id: 1,
            id_customer: 7001,
            address1: '10 Downing St',
            city: 'London',
            postcode: 'SW1A 2AA',
            id_country: 17,
            phone: '+44 20 7930 4433',
            phone_mobile: null,
          },
        ],
      }),
    )
    expect(result.phone).toBe('+44 20 7930 4433')
  })

  it('maps multiple addresses correctly', () => {
    const result = transformCustomer(
      makeCustomer({
        _addresses: [
          {
            id: 1,
            id_customer: 7001,
            address1: '1 First St',
            city: 'London',
            postcode: 'W1A 1AA',
            id_country: 17,
            phone_mobile: '+44 7700 900001',
          },
          {
            id: 2,
            id_customer: 7001,
            address1: '2 Second Ave',
            city: 'Manchester',
            postcode: 'M1 1AA',
            id_country: 17,
            phone_mobile: '+44 7700 900002',
          },
        ],
      }),
    )
    expect(result.addresses).toHaveLength(2)
    expect(result.defaultAddress?.line1).toBe('1 First St')
  })

  it('maps createdAt and updatedAt timestamps', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2023-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('handles null email gracefully', () => {
    const result = transformCustomer(makeCustomer({ email: null }))
    expect(result.email).toBeUndefined()
  })

  it('maps postalCode from address postcode field', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.postalCode).toBe('NW1 2AB')
  })

  it('maps country from id_country', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.country).toBeUndefined()
  })

  it('skips empty addresses with no meaningful fields', () => {
    const result = transformCustomer(
      makeCustomer({
        _addresses: [
          {
            id: 99,
            id_customer: 7001,
            address1: null,
            city: null,
            postcode: null,
            id_country: null,
          },
        ],
      }),
    )
    expect(result.addresses).toBeUndefined()
    expect(result.defaultAddress).toBeUndefined()
  })
})
