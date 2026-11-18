import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawFrappeOrganization,
} from '../../../../../../../src/verticals/crm/adapters/frappe-crm/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawFrappeOrganization> = {}): RawFrappeOrganization {
  return { name: 'CRM-ORG-2024-00001', ...overrides }
}

describe('frappe-crm transformCompany', () => {
  it('maps name doc id to string id', () => {
    expect(transformCompany(makeRaw({ name: 'CRM-ORG-0001' })).id).toBe('CRM-ORG-0001')
  })

  it('uses organization_name as name', () => {
    expect(transformCompany(makeRaw({ organization_name: 'Acme Corp' })).name).toBe('Acme Corp')
  })

  it('falls back to doc name when organization_name absent', () => {
    expect(transformCompany(makeRaw({ name: 'CRM-ORG-0001' })).name).toBe('CRM-ORG-0001')
  })

  it('maps website to domain', () => {
    expect(transformCompany(makeRaw({ website: 'acme.example' })).domain).toBe('acme.example')
  })

  it('maps industry field', () => {
    expect(transformCompany(makeRaw({ industry: 'Manufacturing' })).industry).toBe('Manufacturing')
  })

  it('parses lower bound from size band "51-200"', () => {
    expect(transformCompany(makeRaw({ no_of_employees: '51-200' })).size).toBe(51)
  })

  it('parses lower bound from size band "1-10"', () => {
    expect(transformCompany(makeRaw({ no_of_employees: '1-10' })).size).toBe(1)
  })

  it('returns undefined size when no_of_employees absent', () => {
    expect(transformCompany(makeRaw()).size).toBeUndefined()
  })

  it('converts creation/modified timestamps to ISO', () => {
    const result = transformCompany(
      makeRaw({
        creation: '2023-11-01 10:00:00.000000',
        modified: '2023-11-14 22:00:00.000000',
      }),
    )
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('passes CompanySchema validation with full input', () => {
    const raw: RawFrappeOrganization = {
      name: 'CRM-ORG-0001',
      organization_name: 'Acme Corp',
      website: 'acme.example',
      no_of_employees: '51-200',
      industry: 'Manufacturing',
      creation: '2023-11-01T10:00:00.000Z',
      modified: '2023-11-14T22:00:00.000Z',
    }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('frappe-crm untransformCompany', () => {
  it('maps name back to organization_name', () => {
    expect(untransformCompany({ name: 'Acme Corp' }).organization_name).toBe('Acme Corp')
  })

  it('maps domain back to website', () => {
    expect(untransformCompany({ domain: 'acme.example' }).website).toBe('acme.example')
  })

  it('maps industry back through', () => {
    expect(untransformCompany({ industry: 'Manufacturing' }).industry).toBe('Manufacturing')
  })

  it('omits unset fields', () => {
    const result = untransformCompany({ name: 'Acme' })
    expect(result).not.toHaveProperty('website')
    expect(result).not.toHaveProperty('industry')
  })
})
