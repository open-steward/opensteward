import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawManatalOrganization,
} from '../../../../../../../src/verticals/crm/adapters/manatal/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawManatalOrganization> = {}): RawManatalOrganization {
  return { id: 1, name: 'Acme Corp', ...overrides }
}

describe('manatal transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Globex' })).name).toBe('Globex')
  })

  it('maps website to domain', () => {
    expect(transformCompany(makeRaw({ website: 'globex.com' })).domain).toBe('globex.com')
  })

  it('maps phone', () => {
    expect(transformCompany(makeRaw({ phone: '+12125550100' })).phone).toBe('+12125550100')
  })

  it('maps industry', () => {
    expect(transformCompany(makeRaw({ industry: 'Technology' })).industry).toBe('Technology')
  })

  it('maps size (headcount)', () => {
    expect(transformCompany(makeRaw({ size: 250 })).size).toBe(250)
  })

  it('maps owner to owner_id as string', () => {
    expect(transformCompany(makeRaw({ owner: 8 })).owner_id).toBe('8')
  })

  it('returns undefined owner_id when owner is null', () => {
    expect(transformCompany(makeRaw({ owner: null })).owner_id).toBeUndefined()
  })

  it('maps created_at to IsoDatetime', () => {
    const result = transformCompany(makeRaw({ created_at: '2024-05-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2024-05-01T00:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('passes CompanySchema validation', () => {
    const raw: RawManatalOrganization = {
      id: 10,
      name: 'Initech',
      website: 'initech.com',
      phone: '+12125550100',
      industry: 'Software',
      size: 100,
      owner: 3,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-06-01T00:00:00.000Z',
    }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('manatal untransformCompany', () => {
  it('maps name', () => {
    expect(untransformCompany({ name: 'Globex' }).name).toBe('Globex')
  })

  it('maps domain to website', () => {
    expect(untransformCompany({ domain: 'globex.com' }).website).toBe('globex.com')
  })

  it('maps owner_id to numeric owner', () => {
    expect(untransformCompany({ owner_id: '8' }).owner).toBe(8)
  })

  it('sets owner to null when owner_id is empty string', () => {
    expect(untransformCompany({ owner_id: '' }).owner).toBeNull()
  })
})
