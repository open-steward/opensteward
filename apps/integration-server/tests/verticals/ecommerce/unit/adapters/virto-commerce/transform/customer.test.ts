/**
 * Virto Commerce Contact → canonical Customer.
 *
 * Field shapes verified against the live demo instance's
 * VirtoCommerce.Customer/swagger.json `components.schemas.Contact` /
 * `CustomerAddress` (fetched 2026-09-13): firstName, lastName, fullName,
 * emails (string[]), phones (string[]), addresses (CustomerAddress[]),
 * createdDate, modifiedDate.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawVirtoContact,
} from '../../../../../../../src/verticals/ecommerce/adapters/virto-commerce/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeContact(overrides: Partial<RawVirtoContact> = {}): RawVirtoContact {
  return {
    id: 'contact-1',
    firstName: 'Jane',
    lastName: 'Doe',
    fullName: 'Jane Doe',
    emails: ['jane.doe@acme.example'],
    phones: ['+14155550123'],
    addresses: [
      {
        line1: '2500 Market Street',
        city: 'San Francisco',
        regionName: 'CA',
        postalCode: '94114',
        countryCode: 'US',
        isDefault: true,
      },
    ],
    createdDate: '2026-01-15T09:30:00Z',
    modifiedDate: '2026-02-01T14:20:00Z',
    ...overrides,
  }
}

describe('transformCustomer (virto-commerce)', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeContact())
    expect(result.id).toBe('contact-1')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('takes the first email and phone', () => {
    const result = transformCustomer(makeContact())
    expect(result.email).toBe('jane.doe@acme.example')
    expect(result.phone).toBe('+14155550123')
  })

  it('maps addresses and picks the default one', () => {
    const result = transformCustomer(makeContact())
    expect(result.addresses).toHaveLength(1)
    expect(result.defaultAddress?.city).toBe('San Francisco')
  })

  it('falls back to the first address when none is marked default', () => {
    const raw = makeContact({
      addresses: [{ line1: 'Only one', city: 'X', isDefault: false }],
    })
    expect(transformCustomer(raw).defaultAddress?.line1).toBe('Only one')
  })

  it('maps createdAt/updatedAt', () => {
    const result = transformCustomer(makeContact())
    expect(result.createdAt).toBe('2026-01-15T09:30:00Z')
    expect(result.updatedAt).toBe('2026-02-01T14:20:00Z')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeContact()
    expect(transformCustomer(raw).metadata).toEqual(raw)
  })

  it('satisfies CustomerSchema, including a minimal contact with no addresses', () => {
    expect(() => CustomerSchema.parse(transformCustomer(makeContact()))).not.toThrow()
    expect(() => CustomerSchema.parse(transformCustomer({ id: 'c2' }))).not.toThrow()
  })

  it('round-trips writable fields via untransformCustomer', () => {
    const canonical = transformCustomer(makeContact())
    const raw = untransformCustomer(canonical)
    expect(raw['firstName']).toBe('Jane')
    expect(raw['lastName']).toBe('Doe')
    expect(raw['emails']).toEqual(['jane.doe@acme.example'])
  })
})
