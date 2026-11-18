import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawClientifyCompany } from '../../../../../../../src/verticals/crm/adapters/clientify/transform/company'

function makeRaw(overrides: Partial<RawClientifyCompany> = {}): RawClientifyCompany {
  return { id: '1', ...overrides }
}

describe('clientify transformCompany', () => {
  it('maps id', () => {
    const result = transformCompany(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps name', () => {
    const result = transformCompany(makeRaw({ name: 'Acme Corp' }))
    expect(result.name).toBe('Acme Corp')
  })

  it('maps phone', () => {
    const result = transformCompany(makeRaw({ phone: '555-1234' }))
    expect(result.phone).toBe('555-1234')
  })

  it('maps domain from website', () => {
    const result = transformCompany(makeRaw({ website: 'example.com' }))
    expect(result.domain).toBe('example.com')
  })

  it('maps owner_id from owner', () => {
    const result = transformCompany(makeRaw({ owner: 'u1' }))
    expect(result.owner_id).toBe('u1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformCompany({ name: 'Test Corp' })
    expect(result).toBeDefined()
    expect(result.name).toBe('Test Corp')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
