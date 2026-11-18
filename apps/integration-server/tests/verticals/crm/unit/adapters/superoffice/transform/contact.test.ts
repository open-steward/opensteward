/**
 * Entity fixture from SuperOffice.CRM.Services.PersonEntity (openapi-v3-Person.json,
 * GET /api/v1/Person/{id}); row fixture from the "Person" archive columns
 * (archive-providers/reference/person) in the documented row shape
 * { "PrimaryKey": "3", "EntityName": "contact", "name": … } of
 * web-services/howto/company/get-all-contacts-rest.
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  transformContactRow,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/superoffice/transform/contact'

const PERSON = {
  PersonId: 123,
  Firstname: 'Bjørn',
  Lastname: 'Hansen',
  FullName: 'Bjørn Hansen',
  Title: 'CFO',
  Emails: [{ Value: 'bjorn@example.no', StrippedValue: 'bjorn@example.no', Description: 'Work' }],
  OfficePhones: [{ Value: '+47 22 00 00 00', StrippedValue: '4722000000' }],
  MobilePhones: [{ Value: '+47 912 34 567', StrippedValue: '4791234567' }],
  Contact: { ContactId: 77, Name: 'Amadeus AS' },
  Associate: { AssociateId: 12, Name: 'OG' },
  CreatedDate: '2024-03-01T08:15:00',
  UpdatedDate: '2024-04-02T09:30:00Z',
}

describe('superoffice transformContact (PersonEntity)', () => {
  it('maps the documented PersonEntity fields', () => {
    const c = ContactSchema.parse(transformContact(PERSON))
    expect(c).toMatchObject({
      id: '123',
      first_name: 'Bjørn',
      last_name: 'Hansen',
      name: 'Bjørn Hansen',
      title: 'CFO',
      email: 'bjorn@example.no',
      phone: '+47 22 00 00 00',
      mobile: '+47 912 34 567',
      company_id: '77',
      owner_id: '12',
      // "Registered date in UTC." — sent without an offset, still UTC
      created_at: '2024-03-01T08:15:00Z',
      updated_at: '2024-04-02T09:30:00Z',
    })
    expect(c.metadata).toEqual(PERSON)
  })

  it('reads the first element of each collection, and the parseable StrippedValue for email', () => {
    const c = ContactSchema.parse(
      transformContact({
        PersonId: 9,
        Emails: [
          { Value: 'Bjørn <first@example.no>', StrippedValue: 'first@example.no' },
          { Value: 'second@example.no', StrippedValue: 'second@example.no' },
        ],
        OfficePhones: [{ Value: '+47 1' }, { Value: '+47 2' }],
        MobilePhones: [{ Value: '+47 3' }, { Value: '+47 4' }],
      }),
    )
    expect(c.email).toBe('first@example.no')
    expect(c.phone).toBe('+47 1')
    expect(c.mobile).toBe('+47 3')
  })

  it('leaves out a company of id 0 and missing collections', () => {
    const c = ContactSchema.parse(transformContact({ PersonId: 5, Contact: { ContactId: 0 } }))
    expect(c.company_id).toBeUndefined()
    expect(c.email).toBeUndefined()
    expect(c.created_at).toBeUndefined()
  })

  it('throws without a PersonId', () => {
    expect(() => transformContact({ Firstname: 'x' })).toThrow(/no id/)
  })

  it('untransforms names (write path unchanged)', () => {
    expect(untransformContact({ first_name: 'A', last_name: 'B' })).toMatchObject({
      Firstname: 'A',
      Lastname: 'B',
    })
  })
})

describe('superoffice transformContactRow (Person archive)', () => {
  const ROW = {
    PrimaryKey: '123',
    EntityName: 'person',
    firstName: 'Bjørn',
    lastName: 'Hansen',
    title: 'CFO',
    contactId: '77',
    personRegisteredDate: '2024-03-01T08:15:00',
    personUpdatedDate: '2024-04-02T09:30:00',
  }

  it('maps the selected columns', () => {
    const c = ContactSchema.parse(transformContactRow(ROW))
    expect(c).toMatchObject({
      id: '123',
      first_name: 'Bjørn',
      last_name: 'Hansen',
      title: 'CFO',
      company_id: '77',
      created_at: '2024-03-01T08:15:00Z',
      updated_at: '2024-04-02T09:30:00Z',
    })
    expect(c.metadata).toEqual(ROW)
  })

  it('throws on a row without PrimaryKey', () => {
    expect(() => transformContactRow({ firstName: 'x' })).toThrow(/PrimaryKey/)
  })
})
