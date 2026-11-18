import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany } from '../../../../../../../src/verticals/crm/adapters/qiscus/transform/company'
import type { RawQiscusCompany } from '../../../../../../../src/verticals/crm/adapters/qiscus/transform/company'

function makeRaw(overrides: Partial<RawQiscusCompany> = {}): RawQiscusCompany {
  return { id: '1', ...overrides }
}

describe('qiscus transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('1')
  })
  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Acme' })).name).toBe('Acme')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformCompany({ name: 'Acme' })
    expect(result).toBeDefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
