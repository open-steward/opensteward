import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawLacrmCompany,
} from '../../../../../../../src/verticals/crm/adapters/lacrm/transform/company'

function makeRaw(overrides: Partial<RawLacrmCompany> = {}): RawLacrmCompany {
  return { ContactId: 'co-1', ...overrides }
}

describe('lacrm transformCompany', () => {
  it('maps ContactId to id', () => {
    expect(transformCompany(makeRaw({ ContactId: 'co-1' })).id).toBe('co-1')
  })

  it('prefers CompanyName over Name', () => {
    const result = transformCompany(makeRaw({ CompanyName: 'LACRM Inc', Name: 'Other' }))
    expect(result.name).toBe('LACRM Inc')
  })

  it('falls back to Name when CompanyName missing', () => {
    const result = transformCompany(makeRaw({ Name: 'Name Fallback' }))
    expect(result.name).toBe('Name Fallback')
  })

  it('maps Website to domain', () => {
    expect(transformCompany(makeRaw({ Website: 'https://lacrm.com' })).domain).toBe('https://lacrm.com')
  })

  it('maps phone from Phone array', () => {
    const result = transformCompany(makeRaw({ Phone: [{ Text: '555-1234' }] }))
    expect(result.phone).toBe('555-1234')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ ContactId: 'co-1' }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('lacrm untransformCompany', () => {
  it('sets IsCompany to true', () => {
    const result = untransformCompany({ name: 'Corp' })
    expect(result.IsCompany).toBe(true)
  })
})
