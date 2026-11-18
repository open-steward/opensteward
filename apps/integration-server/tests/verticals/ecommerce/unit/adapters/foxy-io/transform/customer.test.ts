import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawFoxyCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/foxy-io/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawFoxyCustomer> = {}): RawFoxyCustomer {
  return {
    id: 42,
    email: 'lovelace@example.com',
    first_name: 'Ada',
    last_name: 'Lovelace',
    date_created: '2024-03-01T00:00:00Z',
    date_modified: '2024-03-10T00:00:00Z',
    _embedded: {
      'fx:customer_addresses': [
        {
          address1: '1 Computing Lane',
          city: 'London',
          postal_code: 'EC1A 1BB',
          country: 'GB',
          region: 'England',
          is_default_billing: true,
          is_default_shipping: false,
        },
      ],
    },
    ...overrides,
  }
}

describe('transformCustomer (Foxy.io)', () => {
  it('maps core fields and stringifies numeric id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('42')
    expect(typeof result.id).toBe('string')
    expect(result.email).toBe('lovelace@example.com')
    expect(result.firstName).toBe('Ada')
    expect(result.lastName).toBe('Lovelace')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-10T00:00:00Z')
  })

  it('picks the billing-default address as defaultAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toBeDefined()
    expect(result.defaultAddress?.line1).toBe('1 Computing Lane')
    expect(result.defaultAddress?.country).toBe('GB')
    expect(result.defaultAddress?.postalCode).toBe('EC1A 1BB')
    // Foxy has no customer-level phone
    expect(result.phone).toBeUndefined()
  })

  it('falls back to first address when no billing/shipping default is set', () => {
    const raw = makeCustomer({
      _embedded: {
        'fx:customer_addresses': [
          {
            address1: '2 Fallback Rd',
            city: 'Dublin',
            postal_code: 'D01 AB12',
            country: 'IE',
            is_default_billing: false,
            is_default_shipping: false,
          },
        ],
      },
    })
    const result = transformCustomer(raw)
    expect(result.defaultAddress?.city).toBe('Dublin')
  })

  it('returns undefined addresses when embedded list is empty', () => {
    const result = transformCustomer(makeCustomer({ _embedded: { 'fx:customer_addresses': [] } }))
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

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const back = untransformCustomer(canonical)
    expect(back.email).toBe('lovelace@example.com')
    expect(back.first_name).toBe('Ada')
    expect(back.last_name).toBe('Lovelace')
  })
})
