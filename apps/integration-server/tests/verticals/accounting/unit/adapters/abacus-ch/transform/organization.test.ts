import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type AbacusMandant,
} from '../../../../../../../src/verticals/accounting/adapters/abacus-ch/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeAbacusMandant(overrides: Partial<AbacusMandant> = {}): AbacusMandant {
  return {
    Id: '1',
    Name: 'Acme AG',
    LegalName: 'Acme Aktiengesellschaft',
    VatNumber: 'CHE-123.456.789 MWST',
    Street: 'Bahnhofstrasse 10',
    Street2: 'Postfach 99',
    City: 'Zurich',
    ZipCode: '8001',
    CountryCode: 'CH',
    CurrencyCode: 'CHF',
    Timezone: 'Europe/Zurich',
    Website: 'https://acme.example',
    FiscalYearEnd: '12',
    CreatedAt: '2024-01-01T00:00:00.000Z',
    ModifiedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrganization (abacus-ch)', () => {
  it('maps Id as string', () => {
    const result = transformOrganization(makeAbacusMandant({ Id: 5 }))
    expect(result.id).toBe('5')
  })

  it('maps Name and LegalName', () => {
    const result = transformOrganization(makeAbacusMandant())
    expect(result.name).toBe('Acme AG')
    expect(result.legalName).toBe('Acme Aktiengesellschaft')
  })

  it('maps VatNumber to taxNumber', () => {
    const result = transformOrganization(makeAbacusMandant())
    expect(result.taxNumber).toBe('CHE-123.456.789 MWST')
  })

  it('maps CurrencyCode and Timezone', () => {
    const result = transformOrganization(makeAbacusMandant())
    expect(result.currency).toBe('CHF')
    expect(result.timezone).toBe('Europe/Zurich')
  })

  it('maps FiscalYearEnd (string "12") to fiscalYearEndMonth 12', () => {
    const result = transformOrganization(makeAbacusMandant({ FiscalYearEnd: '12' }))
    expect(result.fiscalYearEndMonth).toBe(12)
  })

  it('maps numeric FiscalYearEnd to fiscalYearEndMonth', () => {
    const result = transformOrganization(makeAbacusMandant({ FiscalYearEnd: 3 }))
    expect(result.fiscalYearEndMonth).toBe(3)
  })

  it('ignores out-of-range FiscalYearEnd', () => {
    expect(
      transformOrganization(makeAbacusMandant({ FiscalYearEnd: 0 })).fiscalYearEndMonth,
    ).toBeUndefined()
    expect(
      transformOrganization(makeAbacusMandant({ FiscalYearEnd: 13 })).fiscalYearEndMonth,
    ).toBeUndefined()
  })

  it('maps address from Street/City/ZipCode/CountryCode', () => {
    const result = transformOrganization(makeAbacusMandant())
    expect(result.address?.address1).toBe('Bahnhofstrasse 10')
    expect(result.address?.address2).toBe('Postfach 99')
    expect(result.address?.city).toBe('Zurich')
    expect(result.address?.postalCode).toBe('8001')
    expect(result.address?.country).toBe('CH')
  })

  it('omits address when all address fields are absent', () => {
    const result = transformOrganization(
      makeAbacusMandant({
        Street: undefined,
        City: undefined,
        ZipCode: undefined,
        CountryCode: undefined,
      }),
    )
    expect(result.address).toBeUndefined()
  })

  it('maps CreatedAt and ModifiedAt as Date', () => {
    const result = transformOrganization(makeAbacusMandant())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeAbacusMandant())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
