import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawSansanCompany } from '../../../../../../../src/verticals/crm/adapters/sansan/transform/company'

function makeRaw(overrides: Partial<RawSansanCompany> = {}): RawSansanCompany {
  return { id: 'C1', ...overrides }
}

describe('sansan transformCompany (placeholder)', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw()).id).toBe('C1')
  })

  it('defaults name to empty string when missing', () => {
    expect(transformCompany(makeRaw()).name).toBe('')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('sansan untransformCompany', () => {
  it('maps name', () => {
    expect(untransformCompany({ name: 'Acme' }).name).toBe('Acme')
  })
})
