import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawMixmaxNote,
} from '../../../../../../../src/verticals/crm/adapters/mixmax/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawMixmaxNote> = {}): RawMixmaxNote {
  return {
    _id: 'note_xyz',
    text: 'Important follow-up note',
    contactId: 'cont_abc',
    createdAt: '2026-01-15T09:30:00.000Z',
    updatedAt: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('mixmax transformNote', () => {
  it('maps _id to string id', () => {
    expect(transformNote(makeRaw()).id).toBe('note_xyz')
  })

  it('falls back to id field when _id is absent', () => {
    expect(transformNote(makeRaw({ _id: undefined, id: 'note_alt' })).id).toBe('note_alt')
  })

  it('maps text field to content', () => {
    expect(transformNote(makeRaw()).content).toBe('Important follow-up note')
  })

  it('falls back to note field when text is absent', () => {
    const result = transformNote(makeRaw({ text: undefined, note: 'From note field' }))
    expect(result.content).toBe('From note field')
  })

  it('uses empty string when neither text nor note present', () => {
    expect(transformNote(makeRaw({ text: undefined, note: undefined })).content).toBe('')
  })

  it('maps contactId to contact_id', () => {
    expect(transformNote(makeRaw()).contact_id).toBe('cont_abc')
  })

  it('converts ISO string timestamps via toIsoDatetime', () => {
    const result = transformNote(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('passes NoteSchema validation', () => {
    expect(() => NoteSchema.parse(transformNote(makeRaw()))).not.toThrow()
  })

  it('untransformNote maps content to text', () => {
    expect(untransformNote({ content: 'Hello world' }).text).toBe('Hello world')
  })
})
