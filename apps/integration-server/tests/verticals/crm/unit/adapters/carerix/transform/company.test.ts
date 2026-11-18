import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawCarerixCompany,
} from '../../../../../../../src/verticals/crm/adapters/carerix/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawCarerixCompany> = {}): RawCarerixCompany {
  return { companyID: 1, name: 'Acme', ...overrides }
}

describe('carerix transformCompany', () => {
  it('maps companyID to string id', () => {
    expect(transformCompany(makeRaw({ companyID: 42 })).id).toBe('42')
  })

  it('falls back to id when companyID is absent', () => {
    expect(transformCompany({ id: 99, name: 'Beta' }).id).toBe('99')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'BigCo' })).name).toBe('BigCo')
  })

  it('extracts domain from full URL', () => {
    const result = transformCompany(makeRaw({ website: 'https://acme.example.com' }))
    expect(result.domain).toBe('acme.example.com')
  })

  it('extracts domain from URL without protocol', () => {
    const result = transformCompany(makeRaw({ website: 'acme.example.com' }))
    expect(result.domain).toBe('acme.example.com')
  })

  it('maps phoneNumber to phone', () => {
    const result = transformCompany(makeRaw({ phoneNumber: '+14155550123' }))
    expect(result.phone).toBe('+14155550123')
  })

  it('maps numberOfEmployees to size as integer', () => {
    const result = transformCompany(makeRaw({ numberOfEmployees: '350' }))
    expect(result.size).toBe(350)
  })

  it('maps industry from string', () => {
    const result = transformCompany(makeRaw({ industry: 'Tech' }))
    expect(result.industry).toBe('Tech')
  })

  it('maps industry from object with name', () => {
    const result = transformCompany(makeRaw({ industry: { name: 'Finance' } }))
    expect(result.industry).toBe('Finance')
  })

  it('maps dateCreated/dateModified to created_at/updated_at', () => {
    const result = transformCompany(
      makeRaw({
        dateCreated: '2026-01-01T00:00:00.000Z',
        dateModified: '2026-02-01T00:00:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T00:00:00.000Z')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('produces output that passes CompanySchema.parse', () => {
    const raw = makeRaw({
      website: 'https://acme.com',
      phoneNumber: '+14155550199',
      numberOfEmployees: 100,
      industry: 'Software',
      dateCreated: '2026-01-01T00:00:00.000Z',
      dateModified: '2026-02-01T00:00:00.000Z',
    })
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('carerix untransformCompany', () => {
  it('maps name', () => {
    const result = untransformCompany({ name: 'Acme' })
    expect(result.name).toBe('Acme')
  })

  it('maps domain to website', () => {
    const result = untransformCompany({ domain: 'acme.com' })
    expect(result.website).toBe('acme.com')
  })

  it('maps phone to phoneNumber', () => {
    const result = untransformCompany({ phone: '+1234567890' })
    expect(result.phoneNumber).toBe('+1234567890')
  })

  it('maps size to numberOfEmployees', () => {
    const result = untransformCompany({ size: 250 })
    expect(result.numberOfEmployees).toBe(250)
  })

  it('omits undefined fields', () => {
    const result = untransformCompany({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
