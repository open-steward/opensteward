import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany } from '../../../../../../../src/verticals/crm/adapters/suitecrm/transform/company'
import type { RawSuiteCrmAccount } from '../../../../../../../src/verticals/crm/adapters/suitecrm/transform/company'

function makeRaw(overrides: Partial<RawSuiteCrmAccount> = {}): RawSuiteCrmAccount {
  return { id: 'co1', ...overrides }
}

describe('suitecrm transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('co1')
  })
  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Acme' })).name).toBe('Acme')
  })
  it('maps phone from phone_office', () => {
    expect(transformCompany(makeRaw({ phone_office: '555-1234' })).phone).toBe('555-1234')
  })
  it('maps domain from website', () => {
    expect(transformCompany(makeRaw({ website: 'https://acme.com' })).domain).toBe('https://acme.com')
  })
  it('maps owner_id from assigned_user_id', () => {
    expect(transformCompany(makeRaw({ assigned_user_id: 'u1' })).owner_id).toBe('u1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformCompany({ name: 'Acme', phone: '555' })
    expect(result.name).toBe('Acme')
    expect(result.phone_office).toBe('555')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
