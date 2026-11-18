import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type VosFacturesDepartment,
} from '../../../../../../../src/verticals/accounting/adapters/vosfactures/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeDepartment(overrides: Partial<VosFacturesDepartment> = {}): VosFacturesDepartment {
  return {
    id: 1,
    name: 'Firma Testowa Sp. z o.o.',
    shortcut: 'FT',
    tax_no: 'PL9876543210',
    post_code: '00-100',
    city: 'Warsaw',
    street: 'ul. Testowa 1',
    country: 'PL',
    email: 'biuro@firma.pl',
    phone: '+48221000000',
    www: 'https://firma.pl',
    created_at: '2023-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeDepartment())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Firma Testowa Sp. z o.o.')
    expect(result.legalName).toBe('Firma Testowa Sp. z o.o.')
    expect(result.organizationCode).toBe('FT')
    expect(result.taxNumber).toBe('PL9876543210')
    expect(result.website).toBe('https://firma.pl')
  })

  it('maps www field to website', () => {
    const result = transformOrganization(makeDepartment({ www: 'https://other.pl' }))
    expect(result.website).toBe('https://other.pl')
  })

  it('maps address block', () => {
    const result = transformOrganization(makeDepartment())
    expect(result.address).toBeDefined()
    expect(result.address!.city).toBe('Warsaw')
    expect(result.address!.postalCode).toBe('00-100')
    expect(result.address!.country).toBe('PL')
  })

  it('parses dates as Date objects', () => {
    const result = transformOrganization(makeDepartment())
    expect(result.createdAt).toEqual(new Date('2023-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('passes raw as metadata', () => {
    const raw = makeDepartment()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformOrganization(makeDepartment())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
