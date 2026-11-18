import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type DualentryCompany,
} from '../../../../../../../src/verticals/accounting/adapters/dualentry/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<DualentryCompany> = {}): DualentryCompany {
  return {
    id: 1,
    name: 'My Company Ltd',
    parent_company_id: null,
    currency_iso_4217_code: 'EUR',
    address: {
      street: '10 Commerce Blvd',
      second_line: null,
      city: 'Warsaw',
      state: 'MZ',
      postal_code: '00-001',
      country: 'PL',
    },
    tin: 'PL1234567890',
    tin_type: 'vat',
    is_active: true,
    fiscal_year_end_month: 12,
    ...overrides,
  }
}

describe('dualentry transformOrganization', () => {
  it('maps id to string', () => {
    const result = transformOrganization(makeRaw({ id: 7 }))
    expect(result.id).toBe('7')
  })

  it('maps name to name and legalName', () => {
    const result = transformOrganization(makeRaw({ name: 'Firm LLC' }))
    expect(result.name).toBe('Firm LLC')
    expect(result.legalName).toBe('Firm LLC')
  })

  it('maps tin to taxNumber', () => {
    const result = transformOrganization(makeRaw({ tin: 'PL9876543210' }))
    expect(result.taxNumber).toBe('PL9876543210')
  })

  it('maps fiscal_year_end_month', () => {
    const result = transformOrganization(makeRaw({ fiscal_year_end_month: 6 }))
    expect(result.fiscalYearEndMonth).toBe(6)
  })

  it('maps parent_company_id to parentId as string', () => {
    const result = transformOrganization(makeRaw({ parent_company_id: 3 }))
    expect(result.parentId).toBe('3')
  })

  it('maps address city', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address?.city).toBe('Warsaw')
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
