import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawCentralStationPerson,
} from '../../../../../../../src/verticals/crm/adapters/centralstationcrm/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawCentralStationPerson> = {}): RawCentralStationPerson {
  return { id: 1, ...overrides }
}

describe('centralstationcrm transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps first_name', () => {
    expect(transformContact(makeRaw({ first_name: 'Jane' })).first_name).toBe('Jane')
  })

  it('maps last_name', () => {
    expect(transformContact(makeRaw({ last_name: 'Doe' })).last_name).toBe('Doe')
  })

  it('derives name from first_name + last_name', () => {
    const result = transformContact(makeRaw({ first_name: 'Jane', last_name: 'Doe' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('maps title', () => {
    expect(transformContact(makeRaw({ title: 'CFO' })).title).toBe('CFO')
  })

  it('extracts email from contact_details', () => {
    const result = transformContact(
      makeRaw({
        contact_details: [{ atype: 'email', value: 'jane@acme.com' }],
      }),
    )
    expect(result.email).toBe('jane@acme.com')
  })

  it('extracts phone from contact_details', () => {
    const result = transformContact(
      makeRaw({
        contact_details: [{ atype: 'phone', value: '+14155550123' }],
      }),
    )
    expect(result.phone).toBe('+14155550123')
  })

  it('extracts mobile from contact_details', () => {
    const result = transformContact(
      makeRaw({
        contact_details: [{ atype: 'mobile', value: '+14155550199' }],
      }),
    )
    expect(result.mobile).toBe('+14155550199')
  })

  it('maps first company in companies array to company_id', () => {
    const result = transformContact(
      makeRaw({
        companies: [{ company: { id: 10, name: 'Acme' } }, { company: { id: 20 } }],
      }),
    )
    expect(result.company_id).toBe('10')
  })

  it('maps user_id to owner_id', () => {
    expect(transformContact(makeRaw({ user_id: 3 })).owner_id).toBe('3')
  })

  it('maps tags array', () => {
    const result = transformContact(
      makeRaw({
        tags: [{ tag: { id: 1, name: 'vip' } }, { tag: { id: 2, name: 'q1' } }],
      }),
    )
    expect(result.tags).toEqual(['vip', 'q1'])
  })

  it('returns undefined tags when tags array is empty', () => {
    const result = transformContact(makeRaw({ tags: [] }))
    expect(result.tags).toBeUndefined()
  })

  it('maps created_at and updated_at', () => {
    const result = transformContact(
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
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('produces output that passes ContactSchema.parse', () => {
    const raw = makeRaw({
      first_name: 'Jane',
      last_name: 'Doe',
      title: 'VP Sales',
      contact_details: [
        { atype: 'email', value: 'jane@acme.com' },
        { atype: 'phone', value: '+14155550123' },
        { atype: 'mobile', value: '+14155550199' },
      ],
      companies: [{ company: { id: 5, name: 'Acme' } }],
      user_id: 3,
      tags: [{ tag: { id: 1, name: 'vip' } }],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
    })
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('centralstationcrm untransformContact', () => {
  it('wraps output in person key', () => {
    const result = untransformContact({})
    expect(result).toHaveProperty('person')
  })

  it('maps first_name to person.first_name', () => {
    const result = untransformContact({ first_name: 'Jane' })
    expect((result.person as Record<string, unknown>).first_name).toBe('Jane')
  })

  it('maps last_name to person.last_name', () => {
    const result = untransformContact({ last_name: 'Doe' })
    expect((result.person as Record<string, unknown>).last_name).toBe('Doe')
  })

  it('maps owner_id to person.user_id', () => {
    const result = untransformContact({ owner_id: 'usr_3' })
    expect((result.person as Record<string, unknown>).user_id).toBe('usr_3')
  })

  it('includes email in contact_details_attributes', () => {
    const result = untransformContact({ email: 'jane@acme.com' })
    const person = result.person as Record<string, unknown>
    const details = person.contact_details_attributes as Array<Record<string, unknown>>
    expect(
      details.some((d) => (d.contact_detail as Record<string, unknown>).atype === 'email'),
    ).toBe(true)
  })

  it('includes mobile in contact_details_attributes', () => {
    const result = untransformContact({ mobile: '+14155550199' })
    const person = result.person as Record<string, unknown>
    const details = person.contact_details_attributes as Array<Record<string, unknown>>
    expect(
      details.some((d) => (d.contact_detail as Record<string, unknown>).atype === 'mobile'),
    ).toBe(true)
  })
})
