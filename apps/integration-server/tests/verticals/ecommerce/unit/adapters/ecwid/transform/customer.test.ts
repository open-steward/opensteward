import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawEcwidCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/ecwid/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(
  overrides: Partial<RawEcwidCustomer> = {},
): RawEcwidCustomer {
  return {
    id: 9001,
    email: 'jane@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    billingPerson: {
      name: 'Jane Doe',
      street: '123 Main St',
      city: 'Stockholm',
      countryCode: 'SE',
      postalCode: '11120',
      stateOrProvinceCode: 'AB',
      phone: '+46701234567',
    },
    shippingAddresses: [
      {
        name: 'Jane Doe',
        street: '456 Ship Ave',
        city: 'Gothenburg',
        countryCode: 'SE',
        postalCode: '41101',
      },
    ],
    registered: '2024-01-15T10:00:00Z',
    updated: '2024-03-01T14:00:00Z',
    orderCount: 5,
    totalStoreCredit: 120.50,
    ...overrides,
  }
}

describe('transformCustomer (Ecwid)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('9001')
    expect(result.email).toBe('jane@example.com')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.phone).toBe('+46701234567')
    expect(result.ordersCount).toBe(5)
  })

  it('maps billing address as default', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress).toBeDefined()
    expect(result.defaultAddress!.line1).toBe('123 Main St')
    expect(result.defaultAddress!.city).toBe('Stockholm')
    expect(result.defaultAddress!.country).toBe('SE')
  })

  it('includes both billing and shipping in addresses array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.addresses).toHaveLength(2)
    expect(result.addresses![1]!.city).toBe('Gothenburg')
  })

  it('maps totalStoreCredit to totalSpent', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.totalSpent).toEqual({ amount: 12050, currency: 'USD' })
  })

  it('falls back to name splitting when firstName/lastName absent', () => {
    const result = transformCustomer(makeCustomer({
      firstName: undefined,
      lastName: undefined,
      name: 'John Smith',
    }))
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Smith')
  })

  it('preserves raw payload in metadata and produces schema-valid result', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const body = untransformCustomer(canonical)
    expect(body['email']).toBe('jane@example.com')
    expect(body['firstName']).toBe('Jane')
    expect(body['lastName']).toBe('Doe')
    expect((body['billingPerson'] as Record<string, unknown>)['street']).toBe('123 Main St')
  })
})
