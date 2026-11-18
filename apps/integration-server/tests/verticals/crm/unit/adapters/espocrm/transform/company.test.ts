import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawEspoCrmAccount,
} from '../../../../../../../src/verticals/crm/adapters/espocrm/transform/company'

function makeRaw(overrides: Partial<RawEspoCrmAccount> = {}): RawEspoCrmAccount {
  return { id: '1', name: 'Acme Corp', ...overrides }
}

describe('espocrm transformCompany', () => {
  it('maps id', () => {
    const result = transformCompany(makeRaw())
    expect(result.id).toBe('1')
  })

  it('throws rather than inventing an id or a name', () => {
    expect(() => transformCompany(makeRaw({ id: undefined }))).toThrow(/Account\.id/)
    expect(() => transformCompany(makeRaw({ name: undefined }))).toThrow(/name/)
  })

  it('maps name', () => {
    const result = transformCompany(makeRaw({ name: 'Acme Corp' }))
    expect(result.name).toBe('Acme Corp')
  })

  it('maps phone from phoneNumber', () => {
    const result = transformCompany(makeRaw({ phoneNumber: '555-1234' }))
    expect(result.phone).toBe('555-1234')
  })

  it('maps domain from website', () => {
    const result = transformCompany(makeRaw({ website: 'example.com' }))
    expect(result.domain).toBe('example.com')
  })

  it('maps industry', () => {
    const result = transformCompany(makeRaw({ industry: 'Tech' }))
    expect(result.industry).toBe('Tech')
  })

  it('maps owner_id from assignedUserId', () => {
    const result = transformCompany(makeRaw({ assignedUserId: 'u1' }))
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
    const result = untransformCompany({ name: 'Test Corp', phone: '555-0000' })
    expect(result).toBeDefined()
    expect(result.name).toBe('Test Corp')
    expect(result.phoneNumber).toBe('555-0000')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })

  it('reads the documented EspoCRM UTC datetimes ("YYYY-MM-DD HH:mm:ss") as ISO 8601', () => {
    const result = CompanySchema.parse(
      transformCompany(
        makeRaw({ createdAt: '2026-11-29 12:34:56', modifiedAt: '2026-11-30 01:02:03' }),
      ),
    )
    expect(result.created_at).toBe('2026-11-29T12:34:56Z')
    expect(result.updated_at).toBe('2026-11-30T01:02:03Z')
  })
})
