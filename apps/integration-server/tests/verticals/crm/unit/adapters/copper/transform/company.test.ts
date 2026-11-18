import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawCopperCompany } from '../../../../../../../src/verticals/crm/adapters/copper/transform/company'

function makeRaw(overrides: Partial<RawCopperCompany> = {}): RawCopperCompany {
  return { id: 1, name: 'Acme', ...overrides }
}

describe('copper transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw()).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme')
  })

  it('maps domain from first website url', () => {
    const result = transformCompany(makeRaw({ websites: [{ url: 'acme.com' }] }))
    expect(result.domain).toBe('acme.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransformCompany maps domain to websites array', () => {
    const result = untransformCompany({ domain: 'test.com' })
    expect((result.websites as Array<{ url: string }>)[0].url).toBe('test.com')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
