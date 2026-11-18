import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawCloseLead } from '../../../../../../../src/verticals/crm/adapters/close/transform/company'

function makeRaw(overrides: Partial<RawCloseLead> = {}): RawCloseLead {
  return { id: 'lead1', ...overrides }
}

describe('close transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('lead1')
  })

  it('maps name from display_name', () => {
    expect(transformCompany(makeRaw({ display_name: 'Acme Inc' })).name).toBe('Acme Inc')
  })

  it('maps domain from url', () => {
    expect(transformCompany(makeRaw({ url: 'acme.com' })).domain).toBe('acme.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransformCompany maps domain to url', () => {
    const result = untransformCompany({ domain: 'test.com' })
    expect(result.url).toBe('test.com')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
