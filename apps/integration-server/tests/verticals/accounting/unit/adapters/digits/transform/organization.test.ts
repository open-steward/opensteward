import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type DigitsCompany,
} from '../../../../../../../src/verticals/accounting/adapters/digits/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeOrg(overrides: Partial<DigitsCompany> = {}): DigitsCompany {
  return {
    businessName: 'Digits Inc.',
    legalName: 'Digits Incorporated',
    taxId: 'EIN-123456789',
    fiscalYearStartMonth: 1,
    timezone: 'America/Chicago',
    currency: 'USD',
    website: 'https://digits.example',
    ...overrides,
  }
}

describe('transformOrganization (digits)', () => {
  it('maps businessName to name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('Digits Inc.')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('Digits Incorporated')
  })

  it('maps taxId to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('EIN-123456789')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrg()).currency).toBe('USD')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeOrg()).timezone).toBe('America/Chicago')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrg()).website).toBe('https://digits.example')
  })

  it('has no id (Digits company endpoint has no id)', () => {
    expect(transformOrganization(makeOrg()).id).toBeUndefined()
  })

  it('does not map fiscalYearEndMonth (only start month known)', () => {
    // Per source comment: "Without knowing the duration, we leave fiscalYearEndMonth unset"
    const result = transformOrganization(makeOrg())
    expect((result as Record<string, unknown>)['fiscalYearEndMonth']).toBeUndefined()
  })

  it('omits name when businessName absent', () => {
    expect(transformOrganization(makeOrg({ businessName: undefined })).name).toBeUndefined()
  })

  it('attaches raw as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
