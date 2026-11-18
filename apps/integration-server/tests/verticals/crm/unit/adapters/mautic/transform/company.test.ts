import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawMauticCompany } from '../../../../../../../src/verticals/crm/adapters/mautic/transform/company'

function makeRaw(overrides: Partial<RawMauticCompany> = {}): RawMauticCompany {
  return { id: '1', ...overrides }
}

describe('mautic transformCompany', () => {
  it('maps id', () => {
    const result = transformCompany(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps name from companyname field', () => {
    const result = transformCompany(makeRaw({ companyname: 'Acme Corp' }))
    expect(result.name).toBe('Acme Corp')
  })

  it('maps name from fields.all.companyname', () => {
    const result = transformCompany(makeRaw({ fields: { all: { companyname: 'From Fields' } } }))
    expect(result.name).toBe('From Fields')
  })

  it('maps phone from companyphone', () => {
    const result = transformCompany(makeRaw({ companyphone: '555-1234' }))
    expect(result.phone).toBe('555-1234')
  })

  it('maps owner_id from owner.id', () => {
    const result = transformCompany(makeRaw({ owner: { id: '5' } }))
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
    const result = untransformCompany({ name: 'Test Corp' })
    expect(result).toBeDefined()
    expect(result.companyname).toBe('Test Corp')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
