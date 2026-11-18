/**
 * Fixtures are built from the property examples of Dwolla's documented
 * customer schemas (BaseCustomer, VerifiedPersonalCustomer,
 * VerifiedBusinessCustomer, UnverifiedCustomer) at
 * https://developers.dwolla.com/docs/api-reference/customers/list-and-search-customers.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawDwollaCustomer,
} from '../../../../../../../src/verticals/payments/adapters/dwolla/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

const LINKS = {
  self: {
    href: 'https://api.dwolla.com',
    type: 'application/vnd.dwolla.v1.hal+json',
    'resource-type': 'resource-type',
  },
}

const VERIFIED_PERSONAL: RawDwollaCustomer = {
  _links: LINKS,
  id: 'c41125c5-99c4-4303-a9f6-d066d28a61e3',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'janedoe@mail.com',
  correlationId: 'CID-abe2bb3d-d2ff-433b-95a3-0debd960ed25',
  created: '2022-10-07T16:46:13.023Z',
  type: 'personal',
  status: 'verified',
  address1: '123 Main Street',
  address2: 'Ste 123',
  city: 'Des Moines',
  state: 'IA',
  postalCode: '50309',
}

const VERIFIED_BUSINESS: RawDwollaCustomer = {
  _links: LINKS,
  id: 'c41125c5-99c4-4303-a9f6-d066d28a61e4',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'janedoe@mail.com',
  created: '2022-10-07T16:46:13.023Z',
  type: 'business',
  status: 'verified',
  address1: '123 Main Street',
  city: 'Des Moines',
  state: 'IA',
  postalCode: '50309',
  phone: '555555555',
  website: 'https://www.dwolla.com',
  businessName: 'Jane Corp',
  businessType: 'llc',
  businessClassification: '9ed3f670-7d6f-11e3-b1ce-5404a6144203',
}

const UNVERIFIED: RawDwollaCustomer = {
  _links: LINKS,
  id: 'c41125c5-99c4-4303-a9f6-d066d28a61e5',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'janedoe@mail.com',
  created: '2022-10-07T16:46:13.023Z',
  type: 'unverified',
  status: 'unverified',
}

describe('dwolla transformCustomer', () => {
  it('maps a verified personal customer from the documented fields', () => {
    const result = CustomerSchema.parse(transformCustomer(VERIFIED_PERSONAL))
    expect(result.id).toBe('c41125c5-99c4-4303-a9f6-d066d28a61e3')
    expect(result.externalId).toBe('c41125c5-99c4-4303-a9f6-d066d28a61e3')
    expect(result.email).toBe('janedoe@mail.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.createdAt).toBe('2022-10-07T16:46:13.023Z')
    expect(result.billingAddress).toEqual({
      line1: '123 Main Street',
      line2: 'Ste 123',
      city: 'Des Moines',
      region: 'IA',
      postalCode: '50309',
    })
    expect(result.billingAddress?.country).toBeUndefined()
    expect(result.currency).toBeUndefined()
    expect(result.gateway).toBe('dwolla')
    expect(result.metadata).toEqual({
      type: 'personal',
      status: 'verified',
      correlationId: 'CID-abe2bb3d-d2ff-433b-95a3-0debd960ed25',
    })
  })

  it('names a business customer by businessName and reads its phone', () => {
    const result = CustomerSchema.parse(transformCustomer(VERIFIED_BUSINESS))
    expect(result.name).toBe('Jane Corp')
    expect(result.phone).toBe('555555555')
    expect(result.billingAddress?.line2).toBeUndefined()
  })

  it('leaves the address absent on an unverified customer', () => {
    const result = CustomerSchema.parse(transformCustomer(UNVERIFIED))
    expect(result.name).toBe('Jane Doe')
    expect(result.billingAddress).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.metadata).toEqual({ type: 'unverified', status: 'unverified' })
  })

  it('throws on a record with no id rather than inventing one', () => {
    expect(() => transformCustomer({ ...UNVERIFIED, id: '' })).toThrow(/no id/)
  })
})
