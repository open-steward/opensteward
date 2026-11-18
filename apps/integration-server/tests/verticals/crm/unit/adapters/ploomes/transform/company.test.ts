import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany } from '../../../../../../../src/verticals/crm/adapters/ploomes/transform/company'
import type { RawPloomesCompany } from '../../../../../../../src/verticals/crm/adapters/ploomes/transform/company'

function makeRaw(overrides: Partial<RawPloomesCompany> = {}): RawPloomesCompany {
  return { Id: 1, ...overrides }
}

describe('ploomes transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('1')
  })
  it('maps name', () => {
    expect(transformCompany(makeRaw({ Name: 'Acme' })).name).toBe('Acme')
  })
  it('maps phone', () => {
    expect(transformCompany(makeRaw({ Phone: '555-1234' })).phone).toBe('555-1234')
  })
  it('maps owner_id from OwnerId', () => {
    expect(transformCompany(makeRaw({ OwnerId: 5 })).owner_id).toBe('5')
  })
  it('handles null OwnerId', () => {
    expect(transformCompany(makeRaw({ OwnerId: null })).owner_id).toBeUndefined()
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
    expect(result.Name).toBe('Acme')
    expect(result.Phone).toBe('555-1234')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
