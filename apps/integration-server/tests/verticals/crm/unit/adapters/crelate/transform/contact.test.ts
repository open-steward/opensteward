/**
 * Crelate v3 contact → canonical Contact. The fixture uses only fields of
 * `RetrieveContacts` in https://app.crelate.com/api3/docs/v3/crelate-openapi.json
 * (Id, FirstName, LastName, Name, EmailAddresses_*, PhoneNumbers_*,
 * CurrentPosition, Addresses_*, Owners, CreatedOn, ModifiedOn), shaped by the
 * spec's EmailAddressesBase / PhoneNumbersBase ({ Value, IsPrimary }),
 * RetrieveWorkHistoryTimelineItem, AddressesBase, Owner and Lookup schemas.
 */
import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawCrelateContact,
} from '../../../../../../../src/verticals/crm/adapters/crelate/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

const DOCUMENTED: RawCrelateContact = {
  Id: '2057720a-2e8e-4feb-8e44-d8dcf943be5a',
  FirstName: 'Jane',
  LastName: 'Doe',
  Name: 'Jane Doe',
  EmailAddresses_Work: { Value: 'jane@acme.example', IsPrimary: false },
  EmailAddresses_Personal: { Value: 'jane.doe@home.example', IsPrimary: true },
  PhoneNumbers_Mobile: { Value: '+14251234567', IsPrimary: false },
  PhoneNumbers_Work_Main: { Value: '+14255550100', IsPrimary: true },
  CurrentPosition: {
    Id: '0f3d7c2e-6f7b-4a39-9a55-9d2c6b1f0a11',
    IsPrimary: true,
    JobTitle: 'Head of Talent',
    CompanyId: { Id: '62bae789-24c8-4407-3f13-deab8172db08', Title: 'Crelate Retail' },
  },
  Addresses_Business: {
    Line1: '1 Main St',
    City: 'Seattle',
    State: 'WA',
    ZipCode: '98101',
    IsPrimary: true,
    CountryId: { Id: '5d2f0c7e-0000-4000-8000-000000000001', Title: 'United States' },
  },
  Owners: [
    { Id: 'aaaaaaaa-0000-4000-8000-000000000001', IsPrimary: false },
    { Id: 'aaaaaaaa-0000-4000-8000-000000000002', IsPrimary: true, Title: 'Olivia Owner' },
  ],
  CreatedOn: '2023-06-23T18:12:07.522503Z',
  ModifiedOn: '2023-07-01T09:00:00Z',
}

describe('crelate transformContact (v3 RetrieveContacts)', () => {
  it('parses against ContactSchema', () => {
    const out = ContactSchema.parse(transformContact(DOCUMENTED))
    expect(out).toMatchObject({
      id: '2057720a-2e8e-4feb-8e44-d8dcf943be5a',
      first_name: 'Jane',
      last_name: 'Doe',
      name: 'Jane Doe',
      email: 'jane.doe@home.example',
      phone: '+14255550100',
      mobile: '+14251234567',
      title: 'Head of Talent',
      company_id: '62bae789-24c8-4407-3f13-deab8172db08',
      owner_id: 'aaaaaaaa-0000-4000-8000-000000000002',
      address: { line1: '1 Main St', city: 'Seattle', region: 'WA', postalCode: '98101' },
    })
    expect(out.created_at).toMatch(/^2023-06-23T18:12:07/)
    expect(out.updated_at).toMatch(/^2023-07-01T09:00:00/)
    expect(out.metadata).toEqual(DOCUMENTED)
  })

  it('leaves country out: Crelate returns a country Lookup, not an ISO code', () => {
    expect(transformContact(DOCUMENTED).address?.country).toBeUndefined()
  })

  it('with no IsPrimary flag, takes the first listed field that has a value', () => {
    const out = ContactSchema.parse(
      transformContact({
        Id: 'c-1',
        EmailAddresses_Work: { Value: null },
        EmailAddresses_Personal: { Value: 'p@home.example' },
        PhoneNumbers_Work_Direct: { Value: '+14255550111' },
      }),
    )
    expect(out.email).toBe('p@home.example')
    expect(out.phone).toBe('+14255550111')
    expect(out.owner_id).toBeUndefined()
  })

  it('a minimal contact parses', () => {
    expect(() => ContactSchema.parse(transformContact({ Id: 'c-2' }))).not.toThrow()
  })

  it('never invents an id', () => {
    expect(() => transformContact({ FirstName: 'No Id' })).toThrow(/without an Id/)
    expect(() => transformContact({ Id: null })).toThrow(/without an Id/)
  })
})

describe('crelate untransformContact (retired-v1 write body, unchanged)', () => {
  it('maps email → work_email.address', () => {
    const out = untransformContact({ email: 'jane@example.com' })
    expect((out.work_email as { address: string }).address).toBe('jane@example.com')
  })

  it('maps phone → mobile_phone.number', () => {
    const out = untransformContact({ phone: '+15550001111' })
    expect((out.mobile_phone as { number: string }).number).toBe('+15550001111')
  })

  it('maps first_name, last_name and title', () => {
    const out = untransformContact({ first_name: 'Jane', last_name: 'Doe', title: 'VP Sales' })
    expect(out).toMatchObject({
      first_name: 'Jane',
      last_name: 'Doe',
      current_position_title: 'VP Sales',
    })
  })
})
