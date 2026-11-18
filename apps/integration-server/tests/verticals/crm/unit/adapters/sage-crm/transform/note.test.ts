import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
} from '../../../../../../../src/verticals/crm/adapters/sage-crm/transform/note'
import { note } from '../fixtures/documented'

describe('sage-crm transformNote (documented Notes)', () => {
  it('maps the documented Notes fields and parses as a canonical Note', () => {
    const raw = note(8)
    const out = NoteSchema.parse(transformNote(raw))
    expect(out).toEqual({
      id: '8',
      content: 'Demo note 8',
      created_at: '2020-10-01T08:00:00.000Z',
      updated_at: '2020-10-03T08:00:00.000Z',
      metadata: raw,
    })
  })

  it('does not guess which entity Note_ForeignTableId names', () => {
    const out = transformNote(note(8))
    expect(out.contact_id).toBeUndefined()
    expect(out.company_id).toBeUndefined()
    expect(out.deal_id).toBeUndefined()
  })

  it('throws without Note_Note rather than serving empty content', () => {
    const { Note_Note: _omit, ...raw } = note(8)
    expect(() => transformNote(raw)).toThrow(/Note_Note/)
  })

  it('untransform keeps its previous (write-path) mapping', () => {
    expect(untransformNote({ content: 'C' })).toEqual({ note_note: 'C' })
  })
})
