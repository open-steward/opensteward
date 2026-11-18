import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawOutreachCompany,
} from '../../../../../../../src/verticals/crm/adapters/outreach/transform/company'

function makeRaw(overrides: Partial<RawOutreachCompany> = {}): RawOutreachCompany {
  return {
    id: '1',
    type: 'account',
    attributes: {},
    ...overrides,
  }
}

describe('outreach transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: '5' })).id).toBe('5')
  })

  it('maps name from attributes', () => {
    expect(transformCompany(makeRaw({ attributes: { name: 'Corp' } })).name).toBe('Corp')
  })

  it('maps domain from websiteUrl', () => {
    expect(transformCompany(makeRaw({ attributes: { websiteUrl: 'https://corp.com' } })).domain).toBe('https://corp.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: '5' }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('outreach untransformCompany', () => {
  it('wraps output in data envelope with type account', () => {
    const result = untransformCompany({ name: 'Corp' })
    expect((result.data as Record<string, unknown>)?.['type']).toBe('account')
  })
})
