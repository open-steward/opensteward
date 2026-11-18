import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawWorkbooksNote,
} from '../../../../../../../src/verticals/crm/adapters/workbooks/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawWorkbooksNote> = {}): RawWorkbooksNote {
  return { id: 'note-1', ...overrides }
}

describe('workbooks transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 42 })).id).toBe('42')
    expect(transformNote(makeRaw({ id: 'note-99' })).id).toBe('note-99')
  })

  it('maps text to content', () => {
    const result = transformNote(makeRaw({ text: 'Follow up on Q1 expansion' }))
    expect(result.content).toBe('Follow up on Q1 expansion')
  })

  it('falls back to subject when text is absent', () => {
    const result = transformNote(makeRaw({ subject: 'A fallback subject' }))
    expect(result.content).toBe('A fallback subject')
  })

  it('prefers text over subject', () => {
    const result = transformNote(makeRaw({ text: 'Text wins', subject: 'Subject loses' }))
    expect(result.content).toBe('Text wins')
  })

  it('defaults content to empty string when both text and subject are absent', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps resource_id to contact_id as string', () => {
    expect(transformNote(makeRaw({ resource_id: 42 })).contact_id).toBe('42')
    expect(transformNote(makeRaw({ resource_id: 'c-5' })).contact_id).toBe('c-5')
  })

  it('sets contact_id to undefined when resource_id is absent', () => {
    expect(transformNote(makeRaw()).contact_id).toBeUndefined()
  })

  it('maps assigned_to_id to owner_id as string', () => {
    expect(transformNote(makeRaw({ assigned_to_id: 7 })).owner_id).toBe('7')
    expect(transformNote(makeRaw({ assigned_to_id: 'u-5' })).owner_id).toBe('u-5')
  })

  it('sets owner_id to undefined when assigned_to_id is absent', () => {
    expect(transformNote(makeRaw()).owner_id).toBeUndefined()
  })

  it('maps created_at and updated_at', () => {
    const result = transformNote(
      makeRaw({
        created_at: '2026-01-15T09:30:00.000Z',
        updated_at: '2026-02-01T14:20:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('includes raw object in metadata', () => {
    const raw = makeRaw({ text: 'Some note' })
    const result = transformNote(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes NoteSchema.parse without throwing', () => {
    const raw = makeRaw({
      text: 'Follow up on Q1 expansion',
      resource_id: 'c-1',
      assigned_to_id: 'u-1',
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    })
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('workbooks untransformNote', () => {
  it('maps content back to text', () => {
    expect(untransformNote({ content: 'Some note' }).text).toBe('Some note')
  })

  it('maps contact_id back to resource_id and resource_type', () => {
    const result = untransformNote({ contact_id: 'c-42' })
    expect(result.resource_id).toBe('c-42')
    expect(result.resource_type).toBe('Private::Crm::Person')
  })

  it('omits resource_id and resource_type when contact_id is absent', () => {
    const result = untransformNote({})
    expect(result).not.toHaveProperty('resource_id')
    expect(result).not.toHaveProperty('resource_type')
  })

  it('omits text when content is absent', () => {
    expect(untransformNote({})).not.toHaveProperty('text')
  })

  it('round-trips content and contact_id', () => {
    const raw = makeRaw({
      text: 'Round-trip note',
      resource_id: 'c-1',
    })
    const canonical = transformNote(raw)
    const back = untransformNote(canonical)
    expect(back.text).toBe('Round-trip note')
    expect(back.resource_id).toBe('c-1')
    expect(back.resource_type).toBe('Private::Crm::Person')
  })
})
