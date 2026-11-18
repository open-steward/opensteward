import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, type RawNetsuiteCompany } from '../../../../../../../src/verticals/crm/adapters/netsuite-crm/transform/company'

function makeRaw(overrides: Partial<RawNetsuiteCompany> = {}): RawNetsuiteCompany {
  return { id: '1', ...overrides }
}

describe('netsuite-crm transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('1')
  })

  it('maps name from companyName', () => {
    expect(transformCompany(makeRaw({ companyName: 'Acme' })).name).toBe('Acme')
  })

  it('maps phone', () => {
    expect(transformCompany(makeRaw({ phone: '+1234' })).phone).toBe('+1234')
  })

  it('maps domain from url', () => {
    expect(transformCompany(makeRaw({ url: 'acme.com' })).domain).toBe('acme.com')
  })

  it('maps industry from industry.name', () => {
    expect(transformCompany(makeRaw({ industry: { name: 'Tech' } })).industry).toBe('Tech')
  })

  it('maps owner_id from owner.id', () => {
    expect(transformCompany(makeRaw({ owner: { id: '7' } })).owner_id).toBe('7')
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
