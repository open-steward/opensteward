import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawLoxoNote,
} from '../../../../../../../src/verticals/crm/adapters/loxo/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawLoxoNote> = {}): RawLoxoNote {
  return { id: 1, ...overrides }
}

describe('loxo transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps notes field to content', () => {
    expect(transformNote(makeRaw({ notes: 'Great meeting' })).content).toBe('Great meeting')
  })

  it('defaults content to empty string when notes is null', () => {
    expect(transformNote(makeRaw({ notes: null })).content).toBe('')
  })

  it('maps person_id to contact_id as string', () => {
    expect(transformNote(makeRaw({ person_id: 10 })).contact_id).toBe('10')
  })

  it('returns undefined contact_id when person_id is null', () => {
    expect(transformNote(makeRaw({ person_id: null })).contact_id).toBeUndefined()
  })

  it('maps created_by_id to owner_id', () => {
    expect(transformNote(makeRaw({ created_by_id: 5 })).owner_id).toBe('5')
  })

  it('maps created_at to IsoDatetime', () => {
    const result = transformNote(makeRaw({ created_at: '2024-03-15T10:00:00.000Z' }))
    expect(result.created_at).toBe('2024-03-15T10:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('passes NoteSchema validation', () => {
    const raw: RawLoxoNote = {
      id: 1,
      notes: 'Follow up on Q1 expansion',
      person_id: 10,
      created_by_id: 5,
      created_at: '2024-01-15T09:30:00.000Z',
      updated_at: '2024-02-01T14:20:00.000Z',
    }
    const result = transformNote(raw)
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('loxo untransformNote', () => {
  it('maps content to notes in person_event wrapper', () => {
    const result = untransformNote({ content: 'Follow up' })
    expect((result.person_event as Record<string, unknown>).notes).toBe('Follow up')
  })

  it('maps contact_id to person_id', () => {
    const result = untransformNote({ contact_id: '10' })
    expect((result.person_event as Record<string, unknown>).person_id).toBe('10')
  })

  it('maps owner_id to created_by_id', () => {
    const result = untransformNote({ owner_id: '5' })
    expect((result.person_event as Record<string, unknown>).created_by_id).toBe('5')
  })
})
