import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawTeamworkNote,
} from '../../../../../../../src/verticals/crm/adapters/teamwork-crm/transform/note'
import { NOTE } from '../fixtures'

describe('teamwork-crm transformNote', () => {
  it('maps the documented Note model to a canonical Note', () => {
    const raw = { ...NOTE } as RawTeamworkNote
    const note = NoteSchema.parse(transformNote(raw))
    expect(note).toMatchObject({
      id: '4001',
      content: 'Asked for a revised quote',
      deal_id: '9001',
      owner_id: '7',
      created_at: '2020-03-02T09:15:00Z',
      updated_at: '2020-06-10T16:40:00Z',
    })
    expect(note.contact_id).toBeUndefined()
    expect(note.company_id).toBeUndefined()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('routes the subject relationship by its type', () => {
    const onContact = transformNote({
      ...NOTE,
      subject: { id: 101, type: 'contacts' },
    } as RawTeamworkNote)
    expect(onContact.contact_id).toBe('101')
    expect(onContact.deal_id).toBeUndefined()
    const onCompany = transformNote({
      ...NOTE,
      subject: { id: 55, type: 'companies' },
    } as RawTeamworkNote)
    expect(onCompany.company_id).toBe('55')
    expect(onCompany.deal_id).toBeUndefined()
  })

  it('reads owner_id from createdBy, not updatedBy', () => {
    const note = transformNote({
      ...NOTE,
      createdBy: { id: 7, type: 'users' },
      updatedBy: { id: 8, type: 'users' },
    } as RawTeamworkNote)
    expect(note.owner_id).toBe('7')
  })

  it('maps an empty (null) description to empty content', () => {
    const note = NoteSchema.parse(transformNote({ ...NOTE, description: null } as RawTeamworkNote))
    expect(note.content).toBe('')
  })

  it('untransforms back to the write body', () => {
    expect(untransformNote({ content: 'note text' }).body).toBe('note text')
  })
})
