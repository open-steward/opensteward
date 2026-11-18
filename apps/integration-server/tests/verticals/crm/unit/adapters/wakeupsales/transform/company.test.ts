import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawWakeupsalesCompany } from '../../../../../../../src/verticals/crm/adapters/wakeupsales/transform/company'

function makeRaw(overrides: Partial<RawWakeupsalesCompany> = {}): RawWakeupsalesCompany {
  return { id: 'WUC1', ...overrides }
}

describe('wakeupsales transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw()).id).toBe('WUC1')
  })

  it('maps website to domain', () => {
    expect(transformCompany(makeRaw({ website: 'https://wu.com' })).domain).toBe('https://wu.com')
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

describe('wakeupsales untransformCompany', () => {
  it('maps domain to website', () => {
    expect(untransformCompany({ domain: 'wu.com' }).website).toBe('wu.com')
  })
})
