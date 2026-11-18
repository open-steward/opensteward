import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawOrttoCompany,
} from '../../../../../../../src/verticals/crm/adapters/ortto/transform/company'

function makeRaw(overrides: Partial<RawOrttoCompany> = {}): RawOrttoCompany {
  return { id: 'org-1', name: 'Acme', ...overrides }
}

describe('ortto transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 'org-5' })).id).toBe('org-5')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme')
  })

  it('maps domain', () => {
    expect(transformCompany(makeRaw({ domain: 'acme.com' })).domain).toBe('acme.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 'org-5' }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('ortto untransformCompany', () => {
  it('maps name and domain', () => {
    const result = untransformCompany({ name: 'Corp', domain: 'corp.com' })
    expect(result.name).toBe('Corp')
    expect(result.domain).toBe('corp.com')
  })
})
