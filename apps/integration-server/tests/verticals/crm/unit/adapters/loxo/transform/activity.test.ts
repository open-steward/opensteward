import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawLoxoActivity,
} from '../../../../../../../src/verticals/crm/adapters/loxo/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawLoxoActivity> = {}): RawLoxoActivity {
  return { id: 42, ...overrides }
}

describe('loxo transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 99 })).id).toBe('99')
  })

  it('maps activity_type.name to type', () => {
    const result = transformActivity(makeRaw({ activity_type: { id: 1, name: 'call' } }))
    expect(result.type).toBe('call')
  })

  it('maps notes to note', () => {
    const result = transformActivity(makeRaw({ notes: 'Follow up needed' }))
    expect(result.note).toBe('Follow up needed')
  })

  it('maps person_id to contact_id as string', () => {
    expect(transformActivity(makeRaw({ person_id: 77 })).contact_id).toBe('77')
  })

  it('maps created_by_id to owner_id as string', () => {
    expect(transformActivity(makeRaw({ created_by_id: 5 })).owner_id).toBe('5')
  })

  it('maps created_at to IsoDatetime', () => {
    const result = transformActivity(makeRaw({ created_at: '2024-03-15T10:00:00.000Z' }))
    expect(result.created_at).toBe('2024-03-15T10:00:00.000Z')
  })

  it('returns undefined for null person_id', () => {
    expect(transformActivity(makeRaw({ person_id: null })).contact_id).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('passes ActivitySchema validation', () => {
    const raw: RawLoxoActivity = {
      id: 1,
      activity_type: { id: 2, name: 'email' },
      notes: 'Discussion notes',
      person_id: 10,
      created_by_id: 5,
      created_at: '2024-01-10T08:00:00.000Z',
      updated_at: '2024-01-11T08:00:00.000Z',
    }
    const result = transformActivity(raw)
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('loxo untransformActivity', () => {
  it('maps note to notes in person_event wrapper', () => {
    const result = untransformActivity({ note: 'Important call' })
    expect((result.person_event as Record<string, unknown>).notes).toBe('Important call')
  })

  it('maps contact_id to person_id', () => {
    const result = untransformActivity({ contact_id: '77' })
    expect((result.person_event as Record<string, unknown>).person_id).toBe('77')
  })

  it('maps owner_id to created_by_id', () => {
    const result = untransformActivity({ owner_id: '5' })
    expect((result.person_event as Record<string, unknown>).created_by_id).toBe('5')
  })
})
