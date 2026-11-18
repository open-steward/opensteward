import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawClozeCompany,
} from '../../../../../../../src/verticals/crm/adapters/cloze/transform/company'

function makeRaw(overrides: Partial<RawClozeCompany> = {}): RawClozeCompany {
  return { ...overrides }
}

describe('cloze transformCompany', () => {
  it('maps id from direct field', () => {
    expect(transformCompany(makeRaw({ direct: 'co-001' })).id).toBe('co-001')
  })

  it('falls back to id field when direct is absent', () => {
    expect(transformCompany(makeRaw({ id: 'co-002' })).id).toBe('co-002')
  })

  it('returns empty string id when both direct and id are absent', () => {
    expect(transformCompany(makeRaw()).id).toBe('')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Acme Corp' })).name).toBe('Acme Corp')
  })

  it('returns empty string name when name is absent', () => {
    expect(transformCompany(makeRaw()).name).toBe('')
  })

  it('maps domain from first entry in domains array', () => {
    const result = transformCompany(makeRaw({ domains: ['acme.com', 'acme.org'] }))
    expect(result.domain).toBe('acme.com')
  })

  it('returns undefined domain when domains array is absent', () => {
    expect(transformCompany(makeRaw()).domain).toBeUndefined()
  })

  it('maps phone from first entry in phones array', () => {
    const result = transformCompany(
      makeRaw({ phones: [{ value: '+1-555-0100' }, { value: '+1-555-0200' }] }),
    )
    expect(result.phone).toBe('+1-555-0100')
  })

  it('returns undefined phone when phones array is absent', () => {
    expect(transformCompany(makeRaw()).phone).toBeUndefined()
  })

  it('maps created_at from ISO string', () => {
    const result = transformCompany(makeRaw({ created: '2024-03-10T08:00:00.000Z' }))
    expect(result.created_at).toBe('2024-03-10T08:00:00.000Z')
  })

  it('maps updated_at from ISO string', () => {
    const result = transformCompany(makeRaw({ modified: '2024-07-20T15:45:00.000Z' }))
    expect(result.updated_at).toBe('2024-07-20T15:45:00.000Z')
  })

  it('sets created_at and updated_at to undefined when timestamps are absent', () => {
    const result = transformCompany(makeRaw())
    expect(result.created_at).toBeUndefined()
    expect(result.updated_at).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ direct: 'co-001' }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('cloze untransformCompany', () => {
  it('maps name', () => {
    const result = untransformCompany({ name: 'Globex' })
    expect(result.name).toBe('Globex')
  })

  it('wraps domain as single-entry domains array', () => {
    const result = untransformCompany({ domain: 'globex.com' })
    expect(result.domains).toEqual(['globex.com'])
  })

  it('wraps phone as single-entry phones array', () => {
    const result = untransformCompany({ phone: '+1-555-9999' })
    expect(result.phones).toEqual([{ value: '+1-555-9999' }])
  })

  it('omits fields not present in input', () => {
    const result = untransformCompany({})
    expect(result.name).toBeUndefined()
    expect(result.domains).toBeUndefined()
    expect(result.phones).toBeUndefined()
  })
})
