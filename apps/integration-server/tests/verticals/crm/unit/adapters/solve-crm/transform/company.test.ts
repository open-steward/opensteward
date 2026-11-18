import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany } from '../../../../../../../src/verticals/crm/adapters/solve-crm/transform/company'
import type { RawSolveOrganisation } from '../../../../../../../src/verticals/crm/adapters/solve-crm/transform/company'

function makeRaw(overrides: Partial<RawSolveOrganisation> = {}): RawSolveOrganisation {
  return { id: '1', ...overrides }
}

describe('solve-crm transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('1')
  })
  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Acme' })).name).toBe('Acme')
  })
  it('extracts domain from website URL', () => {
    expect(transformCompany(makeRaw({ website: 'https://www.acme.com' })).domain).toBe('acme.com')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformCompany({ name: 'Acme', phone: '555' })
    expect(result).toBeDefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
