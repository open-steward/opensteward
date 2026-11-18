import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type QuickFileAccountDetails,
} from '../../../../../../../src/verticals/accounting/adapters/quickfile/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeDetails(overrides: Partial<QuickFileAccountDetails> = {}): QuickFileAccountDetails {
  return {
    CompanyName: 'QuickFile Demo Ltd',
    CompanyNumber: 'UK12345678',
    Address: '10 Downing Street',
    CountryIso: 'GB',
    BaseCurrency: 'GBP',
    VatRegNumber: 'GB999999999',
    Web: 'https://demo.quickfile.co.uk',
    Tel: '+44 20 0000 0000',
    BusinessType: 'LimitedCompany',
    YearEndDate: '2024-03-31',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps CompanyName to name', () => {
    expect(transformOrganization(makeDetails()).name).toBe('QuickFile Demo Ltd')
  })

  it('maps CompanyName to legalName', () => {
    expect(transformOrganization(makeDetails()).legalName).toBe('QuickFile Demo Ltd')
  })

  it('maps CompanyNumber to organizationCode', () => {
    expect(transformOrganization(makeDetails()).organizationCode).toBe('UK12345678')
  })

  it('maps VatRegNumber to taxNumber', () => {
    expect(transformOrganization(makeDetails()).taxNumber).toBe('GB999999999')
  })

  it('maps BaseCurrency to currency', () => {
    expect(transformOrganization(makeDetails()).currency).toBe('GBP')
  })

  it('maps Web to website', () => {
    expect(transformOrganization(makeDetails()).website).toBe('https://demo.quickfile.co.uk')
  })

  it('maps Address to address.address1', () => {
    expect(transformOrganization(makeDetails()).address?.address1).toBe('10 Downing Street')
  })

  it('maps CountryIso to address.country', () => {
    expect(transformOrganization(makeDetails()).address?.country).toBe('GB')
  })

  it('address is undefined when Address field is absent', () => {
    expect(transformOrganization(makeDetails({ Address: undefined })).address).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeDetails()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces output that passes OrganizationSchema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeDetails()))).not.toThrow()
  })

  it('produces schema-valid output when all optional fields are absent', () => {
    const result = transformOrganization({})
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
