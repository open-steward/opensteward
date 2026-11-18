import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type BexioOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/bexio/transform/organization'

function makeOrganization(overrides: Partial<BexioOrganization> = {}): BexioOrganization {
  return {
    id: 601,
    name: 'Acme AG',
    legal_name: 'Acme AG (GmbH)',
    tax_number: 'CHE-123.456.789',
    currency: 'CHF',
    timezone: 'Europe/Zurich',
    website: 'https://acme.ch',
    fiscal_year_end_month: 12,
    address: 'Bahnhofstrasse 1',
    city: 'Zurich',
    postcode: '8001',
    country_code: 'CH',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id as string', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('601')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme AG')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Acme AG (GmbH)')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('CHE-123.456.789')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('CHF')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeOrganization()).timezone).toBe('Europe/Zurich')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://acme.ch')
  })

  it('maps fiscal_year_end_month to fiscalYearEndMonth', () => {
    expect(transformOrganization(makeOrganization()).fiscalYearEndMonth).toBe(12)
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address).toEqual({
      address1: 'Bahnhofstrasse 1',
      city: 'Zurich',
      postalCode: '8001',
      country: 'CH',
    })
  })

  it('returns undefined name when empty', () => {
    expect(transformOrganization(makeOrganization({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined legalName when empty', () => {
    expect(transformOrganization(makeOrganization({ legal_name: '' })).legalName).toBeUndefined()
  })

  it('returns undefined website when empty', () => {
    expect(transformOrganization(makeOrganization({ website: '' })).website).toBeUndefined()
  })

  it('returns undefined fiscalYearEndMonth when zero', () => {
    expect(
      transformOrganization(makeOrganization({ fiscal_year_end_month: 0 })).fiscalYearEndMonth,
    ).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
