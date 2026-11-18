import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopgateCustomer,
  type RawShopgateContact,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopgate/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

const primaryContact: RawShopgateContact = {
  firstName: 'Maria',
  lastName: 'Schmidt',
  emailAddress: 'maria.schmidt@example.de',
  phone: '+4930123456',
  street1: 'Unter den Linden 10',
  street2: null,
  city: 'Berlin',
  state: 'BE',
  zip: '10117',
  country: 'Germany',
  countryCode: 'DE',
  isPrimary: true,
}

const secondaryContact: RawShopgateContact = {
  firstName: 'Maria',
  lastName: 'Schmidt',
  emailAddress: 'maria.schmidt@example.de',
  street1: 'Kurfürstendamm 25',
  city: 'Berlin',
  zip: '10719',
  countryCode: 'DE',
  isPrimary: false,
}

function makeRaw(overrides: Partial<RawShopgateCustomer> = {}): RawShopgateCustomer {
  return {
    id: 'cust-001',
    firstName: 'Maria',
    lastName: 'Schmidt',
    emailAddress: 'maria.schmidt@example.de',
    phone: '+4930123456',
    contacts: [primaryContact, secondaryContact],
    createdAt: '2023-07-15T00:00:00.000Z',
    updatedAt: '2024-03-20T08:00:00.000Z',
    ...overrides,
  }
}

describe('shopgate transformCustomer', () => {
  it('uses raw id directly (not converted)', () => {
    const result = transformCustomer(makeRaw())
    expect(result.id).toBe('cust-001')
  })

  it('maps email and name from top-level fields', () => {
    const result = transformCustomer(makeRaw())
    expect(result.email).toBe('maria.schmidt@example.de')
    expect(result.firstName).toBe('Maria')
    expect(result.lastName).toBe('Schmidt')
  })

  it('uses primary contact for defaultAddress (street1 → line1)', () => {
    const result = transformCustomer(makeRaw())
    expect(result.defaultAddress?.line1).toBe('Unter den Linden 10')
    expect(result.defaultAddress?.city).toBe('Berlin')
    expect(result.defaultAddress?.postalCode).toBe('10117')
    expect(result.defaultAddress?.country).toBe('DE')
  })

  it('puts non-primary contacts in addresses array', () => {
    const result = transformCustomer(makeRaw())
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses![0].line1).toBe('Kurfürstendamm 25')
  })

  it('picks first contact when no isPrimary contact exists', () => {
    const contactA = { ...primaryContact, isPrimary: false }
    const contactB = { ...secondaryContact, isPrimary: false }
    const result = transformCustomer(makeRaw({ contacts: [contactA, contactB] }))
    expect(result.defaultAddress?.line1).toBe('Unter den Linden 10')
  })

  it('maps timestamps', () => {
    const result = transformCustomer(makeRaw())
    expect(result.createdAt).toBe('2023-07-15T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-20T08:00:00.000Z')
  })

  it('produces output that passes CustomerSchema', () => {
    const result = transformCustomer(makeRaw())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const canonical = transformCustomer(makeRaw())
    const back = untransformCustomer(canonical)
    expect(back.firstName).toBe('Maria')
    expect(back.emailAddress).toBe('maria.schmidt@example.de')
  })
})
