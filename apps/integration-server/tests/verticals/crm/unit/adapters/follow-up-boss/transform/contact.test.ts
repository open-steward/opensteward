import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawFollowUpBossPerson,
} from '../../../../../../../src/verticals/crm/adapters/follow-up-boss/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRaw(overrides: Partial<RawFollowUpBossPerson> = {}): RawFollowUpBossPerson {
  return { id: 1, ...overrides }
}

describe('follow-up-boss transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps firstName to first_name', () => {
    expect(transformContact(makeRaw({ firstName: 'Jane' })).first_name).toBe('Jane')
  })

  it('maps lastName to last_name', () => {
    expect(transformContact(makeRaw({ lastName: 'Doe' })).last_name).toBe('Doe')
  })

  it('prefers raw name field over derived name', () => {
    const result = transformContact(
      makeRaw({ name: 'Jane Doe', firstName: 'Jane', lastName: 'Doe' }),
    )
    expect(result.name).toBe('Jane Doe')
  })

  it('derives name from firstName + lastName when name absent', () => {
    const result = transformContact(makeRaw({ firstName: 'Jane', lastName: 'Doe' }))
    expect(result.name).toBe('Jane Doe')
  })

  it('extracts personal email over other types', () => {
    const result = transformContact(
      makeRaw({
        emails: [
          { value: 'other@example.com', type: 'other' },
          { value: 'personal@example.com', type: 'personal' },
        ],
      }),
    )
    expect(result.email).toBe('personal@example.com')
  })

  it('extracts first email when no personal/work type', () => {
    const result = transformContact(
      makeRaw({ emails: [{ value: 'first@example.com', type: 'other' }] }),
    )
    expect(result.email).toBe('first@example.com')
  })

  it('extracts mobile phone by type', () => {
    const result = transformContact(
      makeRaw({
        phones: [
          { value: '+14155550000', type: 'work' },
          { value: '+14155551111', type: 'mobile' },
        ],
      }),
    )
    expect(result.phone).toBe('+14155551111')
  })

  it('maps stage field', () => {
    expect(transformContact(makeRaw({ stage: 'lead' })).stage).toBe('lead')
  })

  it('maps non-empty tags array', () => {
    const result = transformContact(makeRaw({ tags: ['vip', 'q1'] }))
    expect(result.tags).toEqual(['vip', 'q1'])
  })

  it('returns undefined tags for empty array', () => {
    expect(transformContact(makeRaw({ tags: [] })).tags).toBeUndefined()
  })

  it('prefers assignedTo over assignedUserId for owner_id', () => {
    const result = transformContact(makeRaw({ assignedTo: 'agent@example.com', assignedUserId: 5 }))
    expect(result.owner_id).toBe('agent@example.com')
  })

  it('maps created/updated timestamps directly', () => {
    const result = transformContact(
      makeRaw({ created: '2023-11-01T10:00:00.000Z', updated: '2023-11-14T22:00:00.000Z' }),
    )
    expect(result.created_at).toBe('2023-11-01T10:00:00.000Z')
    expect(result.updated_at).toBe('2023-11-14T22:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation with full input', () => {
    const raw: RawFollowUpBossPerson = {
      id: 42,
      firstName: 'Jane',
      lastName: 'Doe',
      name: 'Jane Doe',
      stage: 'lead',
      emails: [{ value: 'jane@example.com', type: 'personal' }],
      phones: [{ value: '+14155551111', type: 'mobile' }],
      tags: ['vip'],
      assignedTo: 'agent@example.com',
      created: '2023-11-01T10:00:00.000Z',
      updated: '2023-11-14T22:00:00.000Z',
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('follow-up-boss untransformContact', () => {
  it('maps first_name to firstName', () => {
    expect(untransformContact({ first_name: 'Jane' }).firstName).toBe('Jane')
  })

  it('maps email into emails array with personal type', () => {
    const result = untransformContact({ email: 'jane@example.com' })
    expect(result.emails).toEqual([{ value: 'jane@example.com', type: 'personal' }])
  })

  it('maps phone into phones array with mobile type', () => {
    const result = untransformContact({ phone: '+14155551111' })
    expect(result.phones).toEqual([{ value: '+14155551111', type: 'mobile' }])
  })

  it('maps stage field through', () => {
    expect(untransformContact({ stage: 'lead' }).stage).toBe('lead')
  })

  it('maps owner_id to assignedTo', () => {
    expect(untransformContact({ owner_id: 'agent@example.com' }).assignedTo).toBe(
      'agent@example.com',
    )
  })

  it('omits unset fields', () => {
    const result = untransformContact({})
    expect(result).not.toHaveProperty('firstName')
    expect(result).not.toHaveProperty('emails')
  })
})
