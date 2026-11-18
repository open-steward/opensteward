/**
 * Entity fixture from SuperOffice.CRM.Services.ContactEntity (openapi-v3-Contact.json,
 * GET /api/v1/Contact/{id}). Row fixture: the documented example of
 * web-services/howto/company/get-all-contacts-rest —
 *   { "PrimaryKey": "3", "EntityName": "contact", "name": "Amadeus AS", "category": "Kunde", "number": "AA10011" }
 * — with the SimpleContact date columns this adapter selects.
 */
import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  transformCompanyRow,
} from '../../../../../../../src/verticals/crm/adapters/superoffice/transform/company'

const CONTACT = {
  ContactId: 3,
  Name: 'Amadeus AS',
  Department: 'Sales',
  Phones: [{ Value: '+47 22 11 11 11' }, { Value: '+47 22 99 99 99' }],
  Domains: ['amadeus.example', 'amadeus-old.example'],
  Associate: { AssociateId: 12 },
  CreatedDate: '2023-01-10T10:00:00Z',
  UpdatedDate: '2024-02-11T11:00:00',
}

describe('superoffice transformCompany (ContactEntity)', () => {
  it('maps the documented ContactEntity fields', () => {
    const c = CompanySchema.parse(transformCompany(CONTACT))
    expect(c).toMatchObject({
      id: '3',
      name: 'Amadeus AS',
      phone: '+47 22 11 11 11',
      domain: 'amadeus.example',
      owner_id: '12',
      created_at: '2023-01-10T10:00:00Z',
      updated_at: '2024-02-11T11:00:00Z',
    })
    expect(c.metadata).toEqual(CONTACT)
  })

  it('throws without an id or a Name', () => {
    expect(() => transformCompany({ Name: 'x' })).toThrow(/no id/)
    expect(() => transformCompany({ ContactId: 3 })).toThrow(/no Name/)
  })
})

describe('superoffice transformCompanyRow (SimpleContact archive)', () => {
  it('maps the documented example row', () => {
    const row = {
      PrimaryKey: '3',
      EntityName: 'contact',
      name: 'Amadeus AS',
      registeredDate: '2023-01-10T10:00:00',
      updatedDate: '2024-02-11T11:00:00+01:00',
    }
    const c = CompanySchema.parse(transformCompanyRow(row))
    expect(c).toMatchObject({
      id: '3',
      name: 'Amadeus AS',
      created_at: '2023-01-10T10:00:00Z',
      updated_at: '2024-02-11T11:00:00+01:00',
    })
    expect(c.metadata).toEqual(row)
  })

  it('throws on a row without a name', () => {
    expect(() => transformCompanyRow({ PrimaryKey: '3' })).toThrow(/no name/)
  })
})
