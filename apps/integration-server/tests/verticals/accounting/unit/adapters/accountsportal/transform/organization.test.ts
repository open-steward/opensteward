import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type APOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/accountsportal/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeAPOrganization(overrides: Partial<APOrganization> = {}): APOrganization {
  return {
    id: 1,
    name: 'Acme Ltd',
    legal_name: 'Acme Limited',
    company_number: 'SC123456',
    vat_number: 'GB123456789',
    currency: 'GBP',
    timezone: 'Europe/London',
    fiscal_year_end_month: 3,
    website: 'https://acme.example',
    address_line_1: '1 Commerce Street',
    address_line_2: null,
    city: 'Edinburgh',
    region: 'Scotland',
    postcode: 'EH1 1AA',
    country: 'GB',
    ...overrides,
  }
}

describe('transformOrganization (accountsportal)', () => {
  it('maps id as string', () => {
    expect(transformOrganization(makeAPOrganization({ id: 1 })).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformOrganization(makeAPOrganization()).name).toBe('Acme Ltd')
  })

  it('prefers legal_name for legalName, falls back to name', () => {
    expect(transformOrganization(makeAPOrganization()).legalName).toBe('Acme Limited')
    expect(transformOrganization(makeAPOrganization({ legal_name: null })).legalName).toBe(
      'Acme Ltd',
    )
  })

  it('prefers vat_number for taxNumber, falls back to company_number', () => {
    expect(transformOrganization(makeAPOrganization()).taxNumber).toBe('GB123456789')
    expect(transformOrganization(makeAPOrganization({ vat_number: null })).taxNumber).toBe(
      'SC123456',
    )
  })

  it('maps currency and timezone', () => {
    const result = transformOrganization(makeAPOrganization())
    expect(result.currency).toBe('GBP')
    expect(result.timezone).toBe('Europe/London')
  })

  it('maps fiscal_year_end_month', () => {
    expect(
      transformOrganization(makeAPOrganization({ fiscal_year_end_month: 3 })).fiscalYearEndMonth,
    ).toBe(3)
  })

  it('leaves fiscalYearEndMonth undefined when null', () => {
    expect(
      transformOrganization(makeAPOrganization({ fiscal_year_end_month: null })).fiscalYearEndMonth,
    ).toBeUndefined()
  })

  it('maps website', () => {
    expect(transformOrganization(makeAPOrganization()).website).toBe('https://acme.example')
  })

  it('always builds address (even with some null fields)', () => {
    const result = transformOrganization(makeAPOrganization())
    expect(result.address).toBeDefined()
    expect(result.address?.address1).toBe('1 Commerce Street')
    expect(result.address?.city).toBe('Edinburgh')
    expect(result.address?.country).toBe('GB')
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeAPOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
