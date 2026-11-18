import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawSalesnexusNote,
} from '../../../../../../../src/verticals/crm/adapters/salesnexus/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawSalesnexusNote> = {}): RawSalesnexusNote {
  return { 'note-id': 'n-1', ...overrides }
}

describe('salesnexus transformNote', () => {
  it('maps note-id to id string', () => {
    expect(transformNote(makeRaw()).id).toBe('n-1')
  })

  it('maps details to content', () => {
    expect(transformNote(makeRaw({ details: 'Important note' })).content).toBe('Important note')
  })

  it('falls back to empty string when details absent', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps contact-id to contact_id string', () => {
    expect(transformNote(makeRaw({ 'contact-id': 'c-7' })).contact_id).toBe('c-7')
  })

  it('maps user-id to owner_id', () => {
    expect(transformNote(makeRaw({ 'user-id': 'u-3' })).owner_id).toBe('u-3')
  })

  it('coerces created-date to ISO string', () => {
    const result = transformNote(makeRaw({ 'created-date': '2024-02-20T08:00:00Z' }))
    expect(result.created_at).toBe('2024-02-20T08:00:00.000Z')
  })

  it('returns undefined created_at for invalid date', () => {
    expect(transformNote(makeRaw({ 'created-date': 'bad-date' })).created_at).toBeUndefined()
  })

  it('preserves raw metadata', () => {
    const raw = makeRaw({ details: 'Hello' })
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawSalesnexusNote = {
      'note-id': 'n-99',
      details: 'Meeting notes',
      'contact-id': 'c-1',
      'user-id': 'u-5',
      'created-date': '2025-01-15T09:30:00.000Z',
    }
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('salesnexus untransformNote', () => {
  it('maps content to details', () => {
    expect(untransformNote({ content: 'Body text' })).toMatchObject({ details: 'Body text' })
  })

  it('maps contact_id to contact-id', () => {
    expect(untransformNote({ contact_id: 'c-4' })).toMatchObject({ 'contact-id': 'c-4' })
  })

  it('maps owner_id to user-id', () => {
    expect(untransformNote({ owner_id: 'u-8' })).toMatchObject({ 'user-id': 'u-8' })
  })

  it('round-trips content through transform/untransform', () => {
    const raw = makeRaw({ details: 'Round-trip content' })
    const note = transformNote(raw)
    const back = untransformNote(note)
    expect(back['details']).toBe('Round-trip content')
  })
})
