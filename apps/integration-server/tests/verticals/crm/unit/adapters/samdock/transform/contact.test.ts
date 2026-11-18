import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawSamdockContact,
} from '../../../../../../../src/verticals/crm/adapters/samdock/transform/contact'

/**
 * Built from the `Person` schema's documented examples
 * (https://samdock.readme.io/reference/personscontroller_browse.md), with the
 * example ids as the documented type, string.
 */
function documentedPerson(overrides: Partial<RawSamdockContact> = {}): RawSamdockContact {
  return {
    _tenantID: '1',
    _id: '1',
    email: 'john.doe@abc.co',
    firstName: 'John',
    lastName: 'Doe',
    gender: 'Male',
    namePrefix: 'J',
    nameSuffix: 'D',
    phoneNumber: 'xxx-xxx-2323',
    mobileNumber: 'xxx-xxx-2323',
    website: 'http://iIntcom.com',
    createdAt: '4/21/2021-14:21:02',
    address: {
      street: 'Street#4',
      number: 'H32',
      postcode: '54000',
      city: 'Denver',
      country: 'US',
    },
    employers: ['1'],
    deals: ['32'],
    ...overrides,
  }
}

describe('samdock transformContact', () => {
  it('maps the documented Person fields and parses as a canonical Contact', () => {
    const raw = documentedPerson()
    const contact = ContactSchema.parse(transformContact(raw))
    expect(contact).toMatchObject({
      id: '1',
      first_name: 'John',
      last_name: 'Doe',
      name: 'John Doe',
      email: 'john.doe@abc.co',
      phone: 'xxx-xxx-2323',
      mobile: 'xxx-xxx-2323',
    })
    expect(contact.metadata).toEqual(raw)
  })

  it('omits a createdAt that is not the documented date-time format', () => {
    expect(transformContact(documentedPerson()).created_at).toBeUndefined()
  })

  it('keeps a createdAt in the documented date-time format', () => {
    const contact = ContactSchema.parse(
      transformContact(documentedPerson({ createdAt: '2021-04-21T14:21:02.000Z' })),
    )
    expect(contact.created_at).toBe('2021-04-21T14:21:02.000Z')
  })

  it('invents no company from the undocumented employers ids', () => {
    expect(transformContact(documentedPerson()).company_id).toBeUndefined()
  })

  it('throws on a person with no _id instead of inventing one', () => {
    expect(() =>
      transformContact(documentedPerson({ _id: undefined as unknown as string })),
    ).toThrow(/_id/)
  })

  it('untransforms Contact to the existing write payload', () => {
    const out = untransformContact({
      first_name: 'Klaus',
      email: 'k@example.de',
      company_id: 'org-1',
    })
    expect(out['first_name']).toBe('Klaus')
    expect(out['email']).toBe('k@example.de')
    expect(out['organization_id']).toBe('org-1')
  })
})
