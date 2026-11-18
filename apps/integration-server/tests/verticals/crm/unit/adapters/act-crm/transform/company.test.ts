import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawActCompany } from '../../../../../../../src/verticals/crm/adapters/act-crm/transform/company'

function makeRaw(overrides: Partial<RawActCompany> = {}): RawActCompany {
  return { id: '1', ...overrides }
}

describe('act-crm transformCompany', () => {
  it('maps id', () => {
    const result = transformCompany(makeRaw())
    expect(result.id).toBe('1')
  })

  it('falls back to companyId when id is missing', () => {
    const result = transformCompany(makeRaw({ id: undefined, companyId: '42' }))
    expect(result.id).toBe('42')
  })

  it('maps name from companyName', () => {
    const result = transformCompany(makeRaw({ companyName: 'Acme Corp' }))
    expect(result.name).toBe('Acme Corp')
  })

  it('maps phone', () => {
    const result = transformCompany(makeRaw({ phone: '555-1234' }))
    expect(result.phone).toBe('555-1234')
  })

  it('extracts domain from website URL', () => {
    const result = transformCompany(makeRaw({ website: 'https://www.example.com' }))
    expect(result.domain).toBe('example.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformCompany({ name: 'Test Corp', phone: '555-0000' })
    expect(result).toBeDefined()
    expect(result.companyName).toBe('Test Corp')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
