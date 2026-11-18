/**
 * Crelate v3 company → canonical Company. The fixture uses only fields of
 * `RetrieveCompanies` / `CompaniesBase` in
 * https://app.crelate.com/api3/docs/v3/crelate-openapi.json.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawCrelateCompany,
} from '../../../../../../../src/verticals/crm/adapters/crelate/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

const DOCUMENTED: RawCrelateCompany = {
  Id: '62bae789-24c8-4407-3f13-deab8172db08',
  Name: 'Crelate Retail',
  Domain: 'crelate-retail.example',
  PhoneNumbers_Main: { Value: '+14255550100', IsPrimary: false },
  PhoneNumbers_Sales: { Value: '+14255550199', IsPrimary: true },
  Addresses_Business: { Line1: '1 Main St', City: 'Seattle', State: 'WA', ZipCode: '98101' },
  Addresses_Headquarters: {
    Line1: '500 Pine St',
    Line2: 'Floor 3',
    City: 'Bellevue',
    State: 'WA',
    ZipCode: '98004',
    IsPrimary: true,
  },
  Owners: [{ Id: 'aaaaaaaa-0000-4000-8000-000000000003', IsPrimary: true }],
  CreatedOn: '2023-06-23T18:12:07.522503Z',
  ModifiedOn: '2023-07-01T09:00:00Z',
}

describe('crelate transformCompany (v3 RetrieveCompanies)', () => {
  it('parses against CompanySchema', () => {
    const out = CompanySchema.parse(transformCompany(DOCUMENTED))
    expect(out).toMatchObject({
      id: '62bae789-24c8-4407-3f13-deab8172db08',
      name: 'Crelate Retail',
      domain: 'crelate-retail.example',
      phone: '+14255550199',
      owner_id: 'aaaaaaaa-0000-4000-8000-000000000003',
      address: {
        line1: '500 Pine St',
        line2: 'Floor 3',
        city: 'Bellevue',
        region: 'WA',
        postalCode: '98004',
      },
    })
    expect(out.created_at).toMatch(/^2023-06-23T18:12:07/)
    expect(out.metadata).toEqual(DOCUMENTED)
  })

  it('a minimal company parses', () => {
    const out = CompanySchema.parse(transformCompany({ Id: 'co-1' }))
    expect(out.address).toBeUndefined()
    expect(out.phone).toBeUndefined()
  })

  it('never invents an id', () => {
    expect(() => transformCompany({ Name: 'No Id' })).toThrow(/without an Id/)
  })
})

describe('crelate untransformCompany (retired-v1 write body, unchanged)', () => {
  it('maps name, phone and address', () => {
    const out = untransformCompany({
      name: 'Acme',
      phone: '+15550001111',
      address: {
        line1: '1 Main St',
        city: 'Springfield',
        region: 'IL',
        postalCode: '62701',
        country: 'US',
      },
    })
    expect(out.name).toBe('Acme')
    expect((out.phone_main as { number: string }).number).toBe('+15550001111')
    expect(out.address_business).toMatchObject({
      line1: '1 Main St',
      state: 'IL',
      zip_code: '62701',
    })
  })
})
