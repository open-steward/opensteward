import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawSalesloftCompany } from '../../../../../../../src/verticals/crm/adapters/salesloft/transform/company'

function makeRaw(overrides: Partial<RawSalesloftCompany> = {}): RawSalesloftCompany {
  return { id: 10, ...overrides }
}

describe('salesloft transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw()).id).toBe('10')
  })

  it('maps website to domain', () => {
    expect(transformCompany(makeRaw({ website: 'https://co.com' })).domain).toBe('https://co.com')
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

describe('salesloft untransformCompany', () => {
  it('maps domain to website', () => {
    expect(untransformCompany({ domain: 'co.com' }).website).toBe('co.com')
  })
})
