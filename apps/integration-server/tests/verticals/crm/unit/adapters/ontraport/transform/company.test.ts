import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany } from '../../../../../../../src/verticals/crm/adapters/ontraport/transform/company'
import type { RawOntraportCompany } from '../../../../../../../src/verticals/crm/adapters/ontraport/transform/company'

function makeRaw(overrides: Partial<RawOntraportCompany> = {}): RawOntraportCompany {
  return { id: '1', ...overrides }
}

describe('ontraport transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('1')
  })
  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Acme Corp' })).name).toBe('Acme Corp')
  })
  it('extracts domain from website URL', () => {
    expect(transformCompany(makeRaw({ website: 'https://www.acme.com' })).domain).toBe('acme.com')
  })
  it('falls back to raw website if URL parse fails', () => {
    expect(transformCompany(makeRaw({ website: 'not-a-url' })).domain).toBe('not-a-url')
  })
  it('maps owner_id', () => {
    expect(transformCompany(makeRaw({ owner: '5' })).owner_id).toBe('5')
  })
  it('handles null owner', () => {
    expect(transformCompany(makeRaw({ owner: null })).owner_id).toBeUndefined()
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformCompany({ name: 'Acme', phone: '555-1234' })
    expect(result.name).toBe('Acme')
    expect(result.office_phone).toBe('555-1234')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
