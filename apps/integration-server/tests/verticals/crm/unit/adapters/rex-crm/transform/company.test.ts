import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawRexCompany,
} from '../../../../../../../src/verticals/crm/adapters/rex-crm/transform/company'

function makeRaw(overrides: Partial<RawRexCompany> = {}): RawRexCompany {
  return { id: 1, ...overrides }
}

describe('rex-crm transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Rex Corp' })).name).toBe('Rex Corp')
  })

  it('maps domain from website', () => {
    expect(transformCompany(makeRaw({ website: 'https://rex.com' })).domain).toBe('https://rex.com')
  })

  it('maps owner_id from user_id', () => {
    expect(transformCompany(makeRaw({ user_id: 3 })).owner_id).toBe('3')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 5 }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('rex-crm untransformCompany', () => {
  it('maps domain to website', () => {
    const result = untransformCompany({ domain: 'https://corp.com' })
    expect(result.website).toBe('https://corp.com')
  })
})
