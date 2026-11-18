import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type AutocountCompanyInfo,
} from '../../../../../../../src/verticals/accounting/adapters/autocount/transform/organization'

function makeCompanyInfo(overrides: Partial<AutocountCompanyInfo> = {}): AutocountCompanyInfo {
  return {
    CompanyCode: 'AC001',
    CompanyName: 'Autocount Sdn Bhd',
    CompanyAddress: '123 Jalan Maju',
    CompanyAddress2: 'Taman Pelangi',
    CompanyAddress3: 'Johor Bahru',
    CompanyPhone: '07-1234567',
    CompanyFax: '07-7654321',
    CompanyEmail: 'info@autocount.com',
    CompanyCurrencyCode: 'MYR',
    CompanyGSTRegistrationNo: 'GST-123456',
    CompanyRocNo: 'ROC-789012',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps CompanyName to name and legalName', () => {
    const result = transformOrganization(makeCompanyInfo())
    expect(result.name).toBe('Autocount Sdn Bhd')
    expect(result.legalName).toBe('Autocount Sdn Bhd')
  })

  it('maps CompanyGSTRegistrationNo to taxNumber', () => {
    expect(transformOrganization(makeCompanyInfo()).taxNumber).toBe('GST-123456')
  })

  it('maps CompanyRocNo to organizationCode', () => {
    expect(transformOrganization(makeCompanyInfo()).organizationCode).toBe('ROC-789012')
  })

  it('maps CompanyCurrencyCode to currency', () => {
    expect(transformOrganization(makeCompanyInfo()).currency).toBe('MYR')
  })

  it('maps CompanyAddress to address.address1', () => {
    expect(transformOrganization(makeCompanyInfo()).address?.address1).toBe('123 Jalan Maju')
  })

  it('concatenates CompanyAddress2 and CompanyAddress3 into address.address2', () => {
    const result = transformOrganization(makeCompanyInfo())
    expect(result.address?.address2).toBe('Taman Pelangi, Johor Bahru')
  })

  it('omits address2 when CompanyAddress2 and CompanyAddress3 are empty', () => {
    const result = transformOrganization(makeCompanyInfo({ CompanyAddress2: '', CompanyAddress3: '' }))
    expect(result.address?.address2).toBeUndefined()
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
