/**
 * Fixture: the documented example of GET /contacts
 * (https://docs.oracle.com/en/cloud/saas/sales/faaps/op-contacts-get.html,
 * "Example of Response Body"), trimmed to the attributes read, plus documented
 * `contacts-item-response` attributes the example leaves null.
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  CONTACT_FIELDS,
  transformContact,
  untransformContact,
  type RawOracleCxContact,
} from '../../../../../../../src/verticals/crm/adapters/oracle-cx/transform/contact'

const DOC_EXAMPLE: RawOracleCxContact = {
  PartyId: -1,
  PartyNumber: 'CONTACT-1033',
  AccountPartyId: null,
  FirstName: 'Lisa',
  LastName: 'Pickford',
  ContactName: 'Lisa Pickford',
  OwnerPartyId: 300100174752464,
  JobTitle: null,
  EmailAddress: null,
  FormattedWorkPhoneNumber: null,
  FormattedMobileNumber: null,
  CreationDate: '2009-03-19T02:56:36+00:00',
  LastUpdateDate: '2020-06-25T09:32:47.007+00:00',
}

describe('oracle-cx transformContact', () => {
  it('maps the documented example and parses against ContactSchema', () => {
    const out = ContactSchema.parse(transformContact(DOC_EXAMPLE))
    expect(out).toMatchObject({
      id: '-1',
      first_name: 'Lisa',
      last_name: 'Pickford',
      name: 'Lisa Pickford',
      owner_id: '300100174752464',
      created_at: '2009-03-19T02:56:36.000Z',
      updated_at: '2020-06-25T09:32:47.007Z',
    })
    expect(out.company_id).toBeUndefined()
    expect(out.email).toBeUndefined()
    expect(out.metadata).toEqual(DOC_EXAMPLE)
  })

  it('reads the documented account, email, phone, mobile and title attributes', () => {
    const out = ContactSchema.parse(
      transformContact({
        ...DOC_EXAMPLE,
        AccountPartyId: 999997549785817,
        EmailAddress: 'lisa.pickford@example.com',
        FormattedWorkPhoneNumber: '+1 (650) 555-0100',
        FormattedMobileNumber: '+1 (650) 555-0199',
        JobTitle: 'Buyer',
      }),
    )
    expect(out).toMatchObject({
      company_id: '999997549785817',
      email: 'lisa.pickford@example.com',
      phone: '+1 (650) 555-0100',
      mobile: '+1 (650) 555-0199',
      title: 'Buyer',
    })
  })

  it('ignores the undocumented attribute names it used to read', () => {
    const out = transformContact({
      PartyId: 1,
      PersonFirstName: 'X',
      PersonLastName: 'Y',
      PhoneNumber: '1',
      PrimaryAccountPartyId: 2,
      OwnedByPartyId: 3,
    })
    expect(out.first_name).toBeUndefined()
    expect(out.last_name).toBeUndefined()
    expect(out.phone).toBeUndefined()
    expect(out.company_id).toBeUndefined()
    expect(out.owner_id).toBeUndefined()
  })

  it('requests exactly the documented attributes it reads', () => {
    expect(CONTACT_FIELDS.split(',')).toEqual([
      'PartyId',
      'FirstName',
      'LastName',
      'ContactName',
      'EmailAddress',
      'FormattedWorkPhoneNumber',
      'FormattedMobileNumber',
      'JobTitle',
      'AccountPartyId',
      'OwnerPartyId',
      'CreationDate',
      'LastUpdateDate',
    ])
  })
})

describe('oracle-cx untransformContact', () => {
  it('maps email to EmailAddress', () => {
    const result = untransformContact({ email: 'a@b.com' })
    expect(result.EmailAddress).toBe('a@b.com')
  })
})
