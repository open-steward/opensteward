import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawRecruitCrmCompany,
} from '../../../../../../../src/verticals/crm/adapters/recruit-crm/transform/company'

function makeRaw(overrides: Partial<RawRecruitCrmCompany> = {}): RawRecruitCrmCompany {
  return { id: '1', name: 'Acme', ...overrides }
}

describe('recruit-crm transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: '7' })).id).toBe('7')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme')
  })

  it('maps domain from website', () => {
    expect(transformCompany(makeRaw({ website: 'https://acme.com' })).domain).toBe('https://acme.com')
  })

  it('maps owner_id from owner object', () => {
    const result = transformCompany(makeRaw({ owner: { id: '5' } }))
    expect(result.owner_id).toBe('5')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: '7' }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('recruit-crm untransformCompany', () => {
  it('maps domain to website', () => {
    const result = untransformCompany({ domain: 'https://corp.com' })
    expect(result.website).toBe('https://corp.com')
  })
})
