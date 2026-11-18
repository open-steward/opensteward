import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawSprykerCustomer,
  type RawSprykerAddress,
} from '../../../../../../../src/verticals/ecommerce/adapters/spryker/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRawCustomer(
  overrides: Partial<RawSprykerCustomer['attributes']> = {},
): RawSprykerCustomer {
  return {
    type: 'customers',
    id: 'DE--1',
    attributes: {
      salutation: 'Mr',
      firstName: 'Karl',
      lastName: 'Müller',
      email: 'karl.mueller@example.de',
      phone: '+49 30 12345678',
      gender: 'Male',
      dateOfBirth: '1985-04-20',
      createdAt: '2024-01-10T08:00:00.000Z',
      updatedAt: '2024-05-15T10:30:00.000Z',
      ...overrides,
    },
  }
}

function makeRawAddress(
  overrides: Partial<RawSprykerAddress['attributes']> = {},
  isDefaultShipping = true,
  isDefaultBilling = false,
): RawSprykerAddress {
  return {
    type: 'customer-addresses',
    id: 'addr-1',
    attributes: {
      salutation: 'Mr',
      firstName: 'Karl',
      lastName: 'Müller',
      address1: 'Unter den Linden 1',
      address2: 'Etage 3',
      address3: null,
      city: 'Berlin',
      zipCode: '10117',
      country: { iso2Code: 'DE', name: 'Germany' },
      iso2Code: 'DE',
      phone: '+49 30 12345678',
      company: null,
      isDefaultShipping,
      isDefaultBilling,
      ...overrides,
    },
  }
}

describe('transformCustomer (Spryker)', () => {
  it('maps customer reference as id', () => {
    const result = transformCustomer(makeRawCustomer())
    // The JSON:API id IS the customer reference
    expect(result.id).toBe('DE--1')
  })

  it('maps firstName, lastName, email and phone from attributes', () => {
    const result = transformCustomer(makeRawCustomer())
    expect(result.firstName).toBe('Karl')
    expect(result.lastName).toBe('Müller')
    expect(result.email).toBe('karl.mueller@example.de')
    expect(result.phone).toBe('+49 30 12345678')
  })

  it('converts createdAt/updatedAt ISO strings', () => {
    const result = transformCustomer(makeRawCustomer())
    expect(result.createdAt).toBe('2024-01-10T08:00:00.000Z')
    expect(result.updatedAt).toBe('2024-05-15T10:30:00.000Z')
  })

  it('maps addresses and picks default shipping as defaultAddress', () => {
    const addr = makeRawAddress({}, true, false)
    const result = transformCustomer(makeRawCustomer(), [addr])
    expect(result.defaultAddress?.line1).toBe('Unter den Linden 1')
    expect(result.defaultAddress?.city).toBe('Berlin')
    expect(result.defaultAddress?.postalCode).toBe('10117')
    expect(result.defaultAddress?.country).toBe('DE')
    expect(result.addresses).toHaveLength(1)
  })

  it('falls back to default billing when no default shipping', () => {
    const addr = makeRawAddress({}, false, true)
    const result = transformCustomer(makeRawCustomer(), [addr])
    expect(result.defaultAddress?.line1).toBe('Unter den Linden 1')
  })

  it('concatenates address2+address3 into line2', () => {
    const addr = makeRawAddress({ address2: 'Floor 2', address3: 'Suite 5' })
    const result = transformCustomer(makeRawCustomer(), [addr])
    expect(result.defaultAddress?.line2).toBe('Floor 2, Suite 5')
  })

  it('produces no addresses when none are provided', () => {
    const result = transformCustomer(makeRawCustomer(), [])
    expect(result.addresses).toBeUndefined()
    expect(result.defaultAddress).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRawCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() =>
      CustomerSchema.parse(transformCustomer(makeRawCustomer(), [makeRawAddress()])),
    ).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const canonical = transformCustomer(makeRawCustomer())
    const body = untransformCustomer(canonical)
    const attrs = (body as { data: { attributes: Record<string, unknown> } }).data.attributes
    expect(attrs['firstName']).toBe('Karl')
    expect(attrs['lastName']).toBe('Müller')
    expect(attrs['email']).toBe('karl.mueller@example.de')
    expect(attrs['acceptedTerms']).toBe(true)
  })
})
