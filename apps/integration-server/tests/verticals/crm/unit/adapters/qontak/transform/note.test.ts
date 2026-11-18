import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote } from '../../../../../../../src/verticals/crm/adapters/qontak/transform/note'
import { notesList } from '../fixtures'

const doc = notesList.response[0]

describe('qontak transformNote (documented GET /qontak/crm/notes example)', () => {
  it('maps the documented fields and satisfies NoteSchema', () => {
    const n = NoteSchema.parse(transformNote(doc))
    expect(n.id).toBe('2')
    expect(n.content).toBe('<p>aaaaa</p>')
    expect(n.contact_id).toBe('86')
    expect(n.deal_id).toBeUndefined()
    expect(n.company_id).toBeUndefined()
    expect(n.owner_id).toBe('1')
    expect(n.created_at).toBe('2024-11-21T08:30:24.132Z')
    expect(n.metadata).toEqual(doc)
  })

  it('throws on a record with no note text', () => {
    expect(() => transformNote({ ...doc, note: null })).toThrow(/note/)
  })
})
