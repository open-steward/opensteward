import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type SimplbooksCompany,
} from '../../../../../../../src/verticals/accounting/adapters/simplbooks/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<SimplbooksCompany> = {}): SimplbooksCompany {
  return {
    id: 1,
    name: 'Acme OÜ',
    legal_name: 'Acme OÜ (Legal)',
    reg_code: '12345678',
    vat_number: 'EE123456789',
    currency: 'EUR',
    timezone: 'Europe/Tallinn',
    website: 'https://acme.example',
    fiscal_year_end_month: 12,
    address: 'Liivalaia 12',
    city: 'Tallinn',
    postal_code: '10118',
    country: 'EE',
    ...overrides,
  }
}

describe('transformOrganization (simplbooks)', () => {
  it('maps numeric id to string id', () => {
    expect(transformOrganization(makeRaw()).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Acme OÜ')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('Acme OÜ (Legal)')
  })

  it('falls back name to legalName when legal_name absent', () => {
    expect(transformOrganization(makeRaw({ legal_name: null })).legalName).toBe('Acme OÜ')
  })

  it('maps vat_number to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('EE123456789')
  })

  it('falls back to reg_code for taxNumber when vat_number absent', () => {
    expect(transformOrganization(makeRaw({ vat_number: null })).taxNumber).toBe('12345678')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('EUR')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeRaw()).timezone).toBe('Europe/Tallinn')
  })

  it('maps fiscal_year_end_month', () => {
    expect(transformOrganization(makeRaw()).fiscalYearEndMonth).toBe(12)
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address?.address1).toBe('Liivalaia 12')
    expect(result.address?.city).toBe('Tallinn')
    expect(result.address?.country).toBe('EE')
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })
})
