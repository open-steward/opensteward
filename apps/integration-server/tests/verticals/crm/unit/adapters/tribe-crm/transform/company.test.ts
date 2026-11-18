import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawTribeCrmOrganisation,
} from '../../../../../../../src/verticals/crm/adapters/tribe-crm/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawTribeCrmOrganisation> = {}): RawTribeCrmOrganisation {
  return { Id: 1, Name: 'Acme', ...overrides }
}

describe('tribe-crm transformCompany', () => {
  it('maps Id to string id', () => {
    expect(transformCompany(makeRaw({ Id: 7 })).id).toBe('7')
  })

  it('maps Name to name', () => {
    expect(transformCompany(makeRaw({ Name: 'Globex' })).name).toBe('Globex')
  })

  it('defaults name to empty string when Name absent', () => {
    const result = transformCompany(makeRaw({ Name: undefined }))
    expect(result.name).toBe('')
  })

  it('maps Domain to domain', () => {
    const result = transformCompany(makeRaw({ Domain: 'acme.com' }))
    expect(result.domain).toBe('acme.com')
  })

  it('maps PhoneNumber to phone', () => {
    const result = transformCompany(makeRaw({ PhoneNumber: '+14155550100' }))
    expect(result.phone).toBe('+14155550100')
  })

  it('maps OwnerId to owner_id', () => {
    const result = transformCompany(makeRaw({ OwnerId: 3 }))
    expect(result.owner_id).toBe('3')
  })

  it('maps CreatedOn to created_at', () => {
    const result = transformCompany(makeRaw({ CreatedOn: '2026-01-15T09:30:00.000Z' }))
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('passes CompanySchema validation', () => {
    const raw = makeRaw({
      Id: 7,
      Name: 'Acme Corp',
      Domain: 'acme.com',
      PhoneNumber: '+14155550100',
      OwnerId: 3,
      CreatedOn: '2026-01-15T09:30:00.000Z',
      ModifiedOn: '2026-02-01T14:20:00.000Z',
    })
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('tribe-crm untransformCompany', () => {
  it('maps name back to Name', () => {
    const result = untransformCompany({ name: 'Acme' })
    expect(result.Name).toBe('Acme')
  })

  it('maps domain back to Domain', () => {
    const result = untransformCompany({ domain: 'acme.com' })
    expect(result.Domain).toBe('acme.com')
  })

  it('maps phone back to PhoneNumber', () => {
    const result = untransformCompany({ phone: '+14155550100' })
    expect(result.PhoneNumber).toBe('+14155550100')
  })

  it('maps owner_id back to OwnerId', () => {
    const result = untransformCompany({ owner_id: '3' })
    expect(result.OwnerId).toBe('3')
  })

  it('omits undefined fields', () => {
    const result = untransformCompany({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
