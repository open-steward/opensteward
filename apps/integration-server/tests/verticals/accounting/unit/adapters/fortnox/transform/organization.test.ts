import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type FortnoxCompanyInfo,
} from '../../../../../../../src/verticals/accounting/adapters/fortnox/transform/organization'

function makeCompanyInfo(overrides: Partial<FortnoxCompanyInfo> = {}): FortnoxCompanyInfo {
  return {
    CompanyName: 'Fortnox AB',
    OrganizationNumber: '556000-1234',
    Address: 'Storgatan 1',
    Address2: 'Box 100',
    City: 'Växjö',
    ZipCode: '35243',
    CountryCode: 'SE',
    Email: 'info@fortnox.se',
    Phone: '0470-12345',
    Website: 'https://fortnox.se',
    Currency: 'SEK',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps CompanyName to name and legalName', () => {
    const result = transformOrganization(makeCompanyInfo())
    expect(result.name).toBe('Fortnox AB')
    expect(result.legalName).toBe('Fortnox AB')
  })

  it('maps OrganizationNumber to taxNumber', () => {
    const result = transformOrganization(makeCompanyInfo())
    expect(result.taxNumber).toBe('556000-1234')
  })

  it('maps Currency to currency', () => {
    const result = transformOrganization(makeCompanyInfo())
    expect(result.currency).toBe('SEK')
  })

  it('maps Website to website', () => {
    const result = transformOrganization(makeCompanyInfo())
    expect(result.website).toBe('https://fortnox.se')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeCompanyInfo())
    expect(result.address?.address1).toBe('Storgatan 1')
    expect(result.address?.address2).toBe('Box 100')
    expect(result.address?.city).toBe('Växjö')
    expect(result.address?.postalCode).toBe('35243')
    expect(result.address?.country).toBe('SE')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeCompanyInfo()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeCompanyInfo())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
