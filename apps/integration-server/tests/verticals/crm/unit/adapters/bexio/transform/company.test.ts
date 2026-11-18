import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawBexioCompany } from '../../../../../../../src/verticals/crm/adapters/bexio/transform/company'

function makeRaw(overrides: Partial<RawBexioCompany> = {}): RawBexioCompany {
  return { id: 1, ...overrides }
}

describe('bexio transformCompany', () => {
  it('maps id', () => {
    const result = transformCompany(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps name from name_1', () => {
    const result = transformCompany(makeRaw({ name_1: 'Acme Corp' }))
    expect(result.name).toBe('Acme Corp')
  })

  it('maps phone from phone_fixed', () => {
    const result = transformCompany(makeRaw({ phone_fixed: '555-1234' }))
    expect(result.phone).toBe('555-1234')
  })

  it('maps domain from url', () => {
    const result = transformCompany(makeRaw({ url: 'example.com' }))
    expect(result.domain).toBe('example.com')
  })

  it('maps owner_id from owner_id', () => {
    const result = transformCompany(makeRaw({ owner_id: 5 }))
    expect(result.owner_id).toBe('5')
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
    expect(result.name_1).toBe('Test Corp')
    expect(result.contact_type_id).toBe(1)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
