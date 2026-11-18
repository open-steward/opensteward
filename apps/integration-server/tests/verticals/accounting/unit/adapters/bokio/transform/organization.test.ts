import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type BokioCompanyInfo,
  type BokioFiscalYear,
} from '../../../../../../../src/verticals/accounting/adapters/bokio/transform/organization'
import { COMPANY_INFORMATION, FISCAL_YEAR, copyOf } from '../fixtures'

const company = (): BokioCompanyInfo => copyOf<BokioCompanyInfo>(COMPANY_INFORMATION)

describe('transformOrganization (Bokio, documented companyInformation)', () => {
  it('maps the documented example and parses against OrganizationSchema', () => {
    const out = OrganizationSchema.parse(transformOrganization(company()))
    expect(out).toMatchObject({
      id: '9b408943-7a1e-47ac-85a7-ac52b2c210d3',
      name: 'Company AB',
      organizationCode: '556677-8899',
      address: {
        address1: 'Älvsborgsvägen 10',
        city: 'Göteborg',
        postalCode: '123 45',
        country: 'SE',
      },
    })
    expect(out.currency).toBeUndefined()
  })

  it('reads organizationNumber and address.line1, not undocumented orgNumber/street', () => {
    const raw = { ...company(), orgNumber: 'wrong', address: { line1: 'X 1', street: 'wrong' } }
    const out = OrganizationSchema.parse(transformOrganization(raw))
    expect(out.organizationCode).toBe('556677-8899')
    expect(out.address?.address1).toBe('X 1')
  })

  it('leaves address unset when none is reported', () => {
    const raw = { ...company(), address: null }
    expect(OrganizationSchema.parse(transformOrganization(raw)).address).toBeUndefined()
  })

  it('keeps the raw row as metadata', () => {
    const raw = company()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })
})

describe('fiscalYearEndMonth (Bokio fiscal years)', () => {
  const year = (overrides: Partial<BokioFiscalYear> = {}): BokioFiscalYear => ({
    ...copyOf<BokioFiscalYear>(FISCAL_YEAR),
    ...overrides,
  })

  it('is the month of the documented example endDate (2023-12-31 → 12)', () => {
    const out = OrganizationSchema.parse(transformOrganization(company(), [year()]))
    expect(out.fiscalYearEndMonth).toBe(12)
  })

  it('follows the latest endDate, not the list order', () => {
    const out = transformOrganization(company(), [
      year({ id: 'b', startDate: '2024-07-01', endDate: '2025-06-30' }),
      year({ id: 'a', startDate: '2023-01-01', endDate: '2024-06-30' }),
      year({ id: 'c', startDate: '2022-01-01', endDate: '2022-12-31' }),
    ])
    expect(OrganizationSchema.parse(out).fiscalYearEndMonth).toBe(6)
  })

  it('is unset with no fiscal year, or none with a date endDate', () => {
    expect(transformOrganization(company()).fiscalYearEndMonth).toBeUndefined()
    expect(
      transformOrganization(company(), [year({ endDate: 'not-a-date' })]).fiscalYearEndMonth,
    ).toBeUndefined()
  })
})
