import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
} from '../../../../../../../src/verticals/crm/adapters/maximizer/transform/note'
import { documentedNote } from '../fixtures/documented'

describe('maximizer transformNote (Octopus Note)', () => {
  it('maps the documented Note fields and parses as a Note', () => {
    const out = NoteSchema.parse(transformNote(documentedNote()))
    expect(out).toMatchObject({ id: 'Tm90ZQkzODEz', content: 'Updating this note using postman' })
    expect(out.contact_id).toBeUndefined()
    expect(out.created_at).toBeUndefined()
  })

  it('reads RichText when a note has no Text', () => {
    const raw = { Key: 'Tm90ZQkzODEz', RichText: '<div>NoteRichText</div>' }
    expect(transformNote(raw).content).toBe('<div>NoteRichText</div>')
  })

  it('reads Text over RichText when a note carries both', () => {
    const raw = { ...documentedNote(), RichText: '<div>NoteRichText</div>' }
    expect(transformNote(raw).content).toBe('Updating this note using postman')
  })

  it('throws when neither Text nor RichText is present instead of inventing a body', () => {
    expect(() => transformNote({ Key: 'Tm90ZQkzODEz' })).toThrow(/neither Text nor RichText/)
  })

  it('keeps the raw row as metadata', () => {
    const raw = documentedNote()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransform is unchanged (write path, out of scope)', () => {
    expect(untransformNote({ content: 'c' })).toEqual({ NoteContent: 'c' })
  })
})
