import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type QBOCompanyInfo,
} from '../../../../../../../src/verticals/accounting/adapters/quickbooks/transform/organization'

function makeCompanyInfo(overrides: Partial<QBOCompanyInfo> = {}): QBOCompanyInfo {
  return {
    Id: '1',
    CompanyName: 'Acme Corp',
    LegalName: 'Acme Corporation LLC',
    CompanyAddr: {
      Line1: '100 Commerce Blvd',
      City: 'San Francisco',
      PostalCode: '94105',
      CountrySubDivisionCode: 'CA',
      Country: 'US',
    },
    PrimaryPhone: { FreeFormNumber: '+14155551234' },
    WebAddr: { URI: 'https://acmecorp.com' },
    Country: 'US',
    FiscalYearStartMonth: 'January',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps CompanyName to name', () => {
    expect(transformOrganization(makeCompanyInfo()).name).toBe('Acme Corp')
  })

  it('maps LegalName to legalName', () => {
    expect(transformOrganization(makeCompanyInfo()).legalName).toBe('Acme Corporation LLC')
  })

  it('maps WebAddr.URI to website', () => {
    expect(transformOrganization(makeCompanyInfo()).website).toBe('https://acmecorp.com')
  })

  it('maps CompanyAddr to address', () => {
    const org = transformOrganization(makeCompanyInfo())
    expect(org.address?.address1).toBe('100 Commerce Blvd')
    expect(org.address?.city).toBe('San Francisco')
    expect(org.address?.postalCode).toBe('94105')
    expect(org.address?.country).toBe('US')
  })

  it('returns undefined address when CompanyAddr absent', () => {
    const org = transformOrganization(makeCompanyInfo({ CompanyAddr: undefined }))
    expect(org.address).toBeUndefined()
  })

  it('returns undefined website when WebAddr absent', () => {
    const org = transformOrganization(makeCompanyInfo({ WebAddr: undefined }))
    expect(org.website).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeCompanyInfo()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeCompanyInfo())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
