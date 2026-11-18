import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type Raw1CrmNote,
} from '../../../../../../../src/verticals/crm/adapters/1crm/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<Raw1CrmNote> = {}): Raw1CrmNote {
  return { id: 'note-1', ...overrides }
}

describe('1crm transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 'note-55' })).id).toBe('note-55')
  })

  it('concatenates subject and body with ": " separator', () => {
    const result = transformNote(
      makeRaw({ name: 'Meeting notes', description: 'Discussed Q1 plan' }),
    )
    expect(result.content).toBe('Meeting notes: Discussed Q1 plan')
  })

  it('uses subject alone when description is absent', () => {
    expect(transformNote(makeRaw({ name: 'Just a subject' })).content).toBe('Just a subject')
  })

  it('uses description alone when name is absent', () => {
    expect(transformNote(makeRaw({ description: 'Just a body' })).content).toBe('Just a body')
  })

  it('produces empty string content when both are absent', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps contact_id', () => {
    expect(transformNote(makeRaw({ contact_id: 'c-10' })).contact_id).toBe('c-10')
  })

  it('maps assigned_user_id to owner_id', () => {
    expect(transformNote(makeRaw({ assigned_user_id: 'u-2' })).owner_id).toBe('u-2')
  })

  it('converts timestamps', () => {
    const result = transformNote(
      makeRaw({
        date_entered: '2026-01-15T09:30:00Z',
        date_modified: '2026-02-01T14:20:00Z',
      }),
    )
    expect(result.created_at).toMatch(/2026-01-15/)
    expect(result.updated_at).toMatch(/2026-02-01/)
  })

  it('passes NoteSchema.parse without throwing', () => {
    const raw = makeRaw({
      name: 'Follow-up',
      description: 'Call tomorrow',
      contact_id: 'c-1',
      assigned_user_id: 'u-1',
      date_entered: '2026-01-01T00:00:00Z',
      date_modified: '2026-01-02T00:00:00Z',
    })
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('1crm untransformNote', () => {
  it('maps content back to description', () => {
    expect(untransformNote({ content: 'Note body' }).description).toBe('Note body')
  })

  it('maps contact_id back', () => {
    expect(untransformNote({ contact_id: 'c-10' }).contact_id).toBe('c-10')
  })

  it('maps owner_id back to assigned_user_id', () => {
    expect(untransformNote({ owner_id: 'u-2' }).assigned_user_id).toBe('u-2')
  })

  it('round-trips content and contact_id', () => {
    const raw = makeRaw({
      name: 'Subject',
      description: 'Body text',
      contact_id: 'c-5',
    })
    const canonical = transformNote(raw)
    const back = untransformNote(canonical)
    // content is "Subject: Body text" so description round-trips as the combined string
    expect(back.description).toBe('Subject: Body text')
    expect(back.contact_id).toBe('c-5')
  })
})
