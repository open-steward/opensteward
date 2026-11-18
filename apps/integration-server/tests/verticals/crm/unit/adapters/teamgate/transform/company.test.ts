import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawTeamgateCompany,
} from '../../../../../../../src/verticals/crm/adapters/teamgate/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawTeamgateCompany> = {}): RawTeamgateCompany {
  return { id: 1, name: 'Acme', ...overrides }
}

describe('teamgate transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Globex' })).name).toBe('Globex')
  })

  it('falls back to id as name when name absent', () => {
    const result = transformCompany(makeRaw({ id: 99, name: undefined }))
    expect(result.name).toBe('99')
  })

  it('extracts phone from first phones array entry', () => {
    const result = transformCompany(makeRaw({ phones: [{ type: 'work', value: '+14155550100' }] }))
    expect(result.phone).toBe('+14155550100')
  })

  it('extracts domain from first url, stripping www prefix', () => {
    const result = transformCompany(
      makeRaw({ urls: [{ type: 'website', value: 'https://www.acme.com' }] }),
    )
    expect(result.domain).toBe('acme.com')
  })

  it('maps industryName to industry', () => {
    const result = transformCompany(makeRaw({ industryName: 'Technology' }))
    expect(result.industry).toBe('Technology')
  })

  it('maps ownerId to owner_id', () => {
    const result = transformCompany(makeRaw({ ownerId: 3 }))
    expect(result.owner_id).toBe('3')
  })

  it('maps string array tags', () => {
    const result = transformCompany(makeRaw({ tags: ['vip', 'q1'] }))
    expect(result.tags).toEqual(['vip', 'q1'])
  })

  it('normalises createdTime to ISO datetime', () => {
    const result = transformCompany(makeRaw({ createdTime: '2026-01-15T09:30:00.000Z' }))
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
      id: 7,
      name: 'Acme Corp',
      phones: [{ type: 'work', value: '+14155550100' }],
      urls: [{ type: 'website', value: 'https://acme.com' }],
      industryName: 'Technology',
      ownerId: 3,
      tags: ['vip'],
      createdTime: '2026-01-15T09:30:00.000Z',
      updatedTime: '2026-02-01T14:20:00.000Z',
    })
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('teamgate untransformCompany', () => {
  it('wraps phone in array with type work', () => {
    const result = untransformCompany({ phone: '+14155550100' })
    expect(result.phones).toEqual([{ type: 'work', value: '+14155550100' }])
  })

  it('wraps domain into https url array', () => {
    const result = untransformCompany({ domain: 'acme.com' })
    expect(result.urls).toEqual([{ type: 'website', value: 'https://acme.com' }])
  })

  it('maps name back to name', () => {
    const result = untransformCompany({ name: 'Acme' })
    expect(result.name).toBe('Acme')
  })

  it('omits undefined fields', () => {
    const result = untransformCompany({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
