import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawTeamgatePerson,
} from '../../../../../../../src/verticals/crm/adapters/teamgate/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawTeamgatePerson> = {}): RawTeamgatePerson {
  return { id: 1, ...overrides }
}

describe('teamgate transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps name from full name field', () => {
    const result = transformContact(makeRaw({ name: 'Jane Doe' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('extracts email from first emails array entry', () => {
    const result = transformContact(makeRaw({ emails: [{ type: 'work', value: 'jane@acme.com' }] }))
    expect(result.email).toBe('jane@acme.com')
  })

  it('extracts phone from first phones array entry', () => {
    const result = transformContact(makeRaw({ phones: [{ type: 'work', value: '+14155550100' }] }))
    expect(result.phone).toBe('+14155550100')
  })

  it('maps companyJobTitle to title', () => {
    const result = transformContact(makeRaw({ companyJobTitle: 'VP Sales' }))
    expect(result.title).toBe('VP Sales')
  })

  it('maps companyId to company_id', () => {
    const result = transformContact(makeRaw({ companyId: 99 }))
    expect(result.company_id).toBe('99')
  })

  it('maps ownerId to owner_id', () => {
    const result = transformContact(makeRaw({ ownerId: 7 }))
    expect(result.owner_id).toBe('7')
  })

  it('normalises createdTime to ISO datetime', () => {
    const result = transformContact(makeRaw({ createdTime: '2026-01-15T09:30:00.000Z' }))
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation', () => {
    const raw = makeRaw({
      id: 42,
      name: 'Jane Doe',
      emails: [{ type: 'work', value: 'jane@acme.com' }],
      phones: [{ type: 'work', value: '+14155550100' }],
      companyJobTitle: 'VP Sales',
      companyId: 99,
      ownerId: 7,
      createdTime: '2026-01-15T09:30:00.000Z',
      updatedTime: '2026-02-01T14:20:00.000Z',
    })
    expect(() => ContactSchema.parse(transformContact(raw))).not.toThrow()
  })
})

describe('teamgate untransformContact', () => {
  it('wraps email in array with type work', () => {
    const result = untransformContact({ email: 'jane@acme.com' })
    expect(result.emails).toEqual([{ type: 'work', value: 'jane@acme.com' }])
  })

  it('wraps phone in array with type work', () => {
    const result = untransformContact({ phone: '+14155550100' })
    expect(result.phones).toEqual([{ type: 'work', value: '+14155550100' }])
  })

  it('maps title to companyJobTitle', () => {
    const result = untransformContact({ title: 'VP Sales' })
    expect(result.companyJobTitle).toBe('VP Sales')
  })

  it('maps company_id to companyId', () => {
    const result = untransformContact({ company_id: '99' })
    expect(result.companyId).toBe('99')
  })

  it('omits undefined fields', () => {
    const result = untransformContact({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
