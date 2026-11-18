import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type KlaraCompany,
} from '../../../../../../../src/verticals/accounting/adapters/klara/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeCompany(overrides: Partial<KlaraCompany> = {}): KlaraCompany {
  return {
    id: 'org-1',
    name: 'Acme AG',
    legal_name: 'Acme Aktiengesellschaft',
    uid: 'CHE-123.456.789',
    currency: 'CHF',
    timezone: 'Europe/Zurich',
    website: 'https://acme.ch',
    address: 'Bahnhofstrasse 1',
    zip: '8001',
    city: 'Zürich',
    country: 'CH',
    fiscal_year_end_month: 12,
    created_at: '2020-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields', () => {
    const result = transformOrganization(makeCompany())
    expect(result.id).toBe('org-1')
    expect(result.name).toBe('Acme AG')
    expect(result.legalName).toBe('Acme Aktiengesellschaft')
    expect(result.currency).toBe('CHF')
    expect(result.timezone).toBe('Europe/Zurich')
    expect(result.website).toBe('https://acme.ch')
    expect(result.fiscalYearEndMonth).toBe(12)
  })

  it('prefers uid over tax_number for taxNumber', () => {
    expect(transformOrganization(makeCompany()).taxNumber).toBe('CHE-123.456.789')
  })

  it('falls back to tax_number when uid absent', () => {
    const result = transformOrganization(makeCompany({ uid: undefined, tax_number: 'CHE-000' }))
    expect(result.taxNumber).toBe('CHE-000')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeCompany())
    expect(result.address?.address1).toBe('Bahnhofstrasse 1')
    expect(result.address?.city).toBe('Zürich')
    expect(result.address?.postalCode).toBe('8001')
    expect(result.address?.country).toBe('CH')
  })

  it('parses dates as Date objects', () => {
    const result = transformOrganization(makeCompany())
    expect(result.createdAt).toEqual(new Date('2020-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('passes schema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeCompany()))).not.toThrow()
  })
})
