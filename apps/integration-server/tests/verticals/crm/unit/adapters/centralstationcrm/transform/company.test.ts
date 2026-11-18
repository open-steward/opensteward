import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawCentralStationCompany,
} from '../../../../../../../src/verticals/crm/adapters/centralstationcrm/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawCentralStationCompany> = {}): RawCentralStationCompany {
  return { id: 1, name: 'Acme Corp', ...overrides }
}

describe('centralstationcrm transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'BigCo' })).name).toBe('BigCo')
  })

  it('defaults name to empty string when absent', () => {
    expect(transformCompany({ id: 1 }).name).toBe('')
  })

  it('extracts phone from contact_details with atype phone', () => {
    const result = transformCompany(
      makeRaw({
        contact_details: [
          { atype: 'email', value: 'info@acme.com' },
          { atype: 'phone', value: '+14155550123' },
        ],
      }),
    )
    expect(result.phone).toBe('+14155550123')
  })

  it('maps user_id to owner_id as string', () => {
    expect(transformCompany(makeRaw({ user_id: 9 })).owner_id).toBe('9')
  })

  it('maps tags array', () => {
    const result = transformCompany(
      makeRaw({
        tags: [{ tag: { id: 1, name: 'vip' } }, { tag: { id: 2, name: 'q1' } }],
      }),
    )
    expect(result.tags).toEqual(['vip', 'q1'])
  })

  it('returns undefined tags when tags array is empty', () => {
    const result = transformCompany(makeRaw({ tags: [] }))
    expect(result.tags).toBeUndefined()
  })

  it('maps created_at and updated_at', () => {
    const result = transformCompany(
      makeRaw({
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T00:00:00.000Z')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('produces output that passes CompanySchema.parse', () => {
    const raw = makeRaw({
      contact_details: [{ atype: 'phone', value: '+14155550123' }],
      user_id: 3,
      tags: [{ tag: { id: 1, name: 'vip' } }],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
    })
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})

describe('centralstationcrm untransformCompany', () => {
  it('wraps output in company key', () => {
    const result = untransformCompany({})
    expect(result).toHaveProperty('company')
  })

  it('maps name to company.name', () => {
    const result = untransformCompany({ name: 'Acme' })
    expect((result.company as Record<string, unknown>).name).toBe('Acme')
  })

  it('maps owner_id to company.user_id', () => {
    const result = untransformCompany({ owner_id: 'usr_3' })
    expect((result.company as Record<string, unknown>).user_id).toBe('usr_3')
  })

  it('includes phone in contact_details_attributes', () => {
    const result = untransformCompany({ phone: '+14155550123' })
    const company = result.company as Record<string, unknown>
    const details = company.contact_details_attributes as Array<Record<string, unknown>>
    expect(details).toHaveLength(1)
    expect((details[0].contact_detail as Record<string, unknown>).atype).toBe('phone')
    expect((details[0].contact_detail as Record<string, unknown>).value).toBe('+14155550123')
  })
})
