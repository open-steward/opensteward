/**
 * Fixture: the documented example of GET /accounts
 * (https://docs.oracle.com/en/cloud/saas/sales/faaps/op-accounts-get.html,
 * "Example of Response Body"), plus documented `accounts-item-response`
 * attributes the example omits.
 */
import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  COMPANY_FIELDS,
  transformCompany,
  untransformCompany,
  type RawOracleCxCompany,
} from '../../../../../../../src/verticals/crm/adapters/oracle-cx/transform/company'

const DOC_EXAMPLE: RawOracleCxCompany = {
  PartyId: 999997549785817,
  PartyNumber: '999997568799048',
  SourceSystem: null,
  SourceSystemReferenceValue: null,
  OrganizationName: 'High Technology_102304669',
  UniqueNameSuffix: '(REDWOOD CITY, US)',
  PartyUniqueName: 'High Technology_102304669 (REDWOOD CITY, US)',
  Type: 'ZCA_CUSTOMER',
  OwnerPartyId: null,
  OwnerPartyNumber: null,
  OwnerEmailAddress: null,
  OwnerName: null,
}

describe('oracle-cx transformCompany', () => {
  it('maps the documented example and parses against CompanySchema', () => {
    const out = CompanySchema.parse(transformCompany(DOC_EXAMPLE))
    expect(out).toMatchObject({ id: '999997549785817', name: 'High Technology_102304669' })
    expect(out.owner_id).toBeUndefined()
    expect(out.metadata).toEqual(DOC_EXAMPLE)
  })

  it('reads the documented owner, URL, phone and dates', () => {
    const out = CompanySchema.parse(
      transformCompany({
        ...DOC_EXAMPLE,
        OwnerPartyId: 300100174752464,
        URL: 'https://www.example.com/about-us',
        FormattedPhoneNumber: '+1 (650) 555-0100',
        CreationDate: '2009-03-19T02:56:36+00:00',
        LastUpdateDate: '2020-06-25T09:32:47.007+00:00',
      }),
    )
    expect(out).toMatchObject({
      owner_id: '300100174752464',
      domain: 'www.example.com',
      phone: '+1 (650) 555-0100',
      created_at: '2009-03-19T02:56:36.000Z',
      updated_at: '2020-06-25T09:32:47.007Z',
    })
  })

  it('keeps only the host of the documented URL attribute as the domain', () => {
    const domain = (URL: string) =>
      CompanySchema.parse(transformCompany({ ...DOC_EXAMPLE, URL })).domain
    expect(domain('www.example.com')).toBe('www.example.com')
    expect(domain('http://example.com:8080/x?y=1')).toBe('example.com')
    expect(domain('not a url')).toBeUndefined()
  })

  it('ignores the undocumented OwnedByPartyId it used to read', () => {
    expect(transformCompany({ ...DOC_EXAMPLE, OwnedByPartyId: 7 }).owner_id).toBeUndefined()
  })

  it('requests exactly the documented attributes it reads', () => {
    expect(COMPANY_FIELDS.split(',')).toEqual([
      'PartyId',
      'OrganizationName',
      'URL',
      'FormattedPhoneNumber',
      'OwnerPartyId',
      'CreationDate',
      'LastUpdateDate',
    ])
  })
})

describe('oracle-cx untransformCompany', () => {
  it('maps name to OrganizationName', () => {
    const result = untransformCompany({ name: 'Corp' })
    expect(result.OrganizationName).toBe('Corp')
  })
})
