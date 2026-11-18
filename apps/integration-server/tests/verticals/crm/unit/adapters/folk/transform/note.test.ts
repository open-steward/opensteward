import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
} from '../../../../../../../src/verticals/crm/adapters/folk/transform/note'
import { documentedNote } from '../fixtures/documented'

describe('folk transformNote (documented Note)', () => {
  it('maps the documented example and satisfies the canonical schema', () => {
    const raw = documentedNote()
    const result = NoteSchema.parse(transformNote(raw))
    expect(result).toMatchObject({
      id: 'nte_91118b73-5a75-480b-b8e3-a33671c35cdc',
      content: 'This is a note about John Doe',
      contact_id: 'per_55175e81-9a52-4ac3-930e-82792c23499b',
      owner_id: 'usr_14c18444-a0c7-459a-86b0-ccd70ebcd65c',
      created_at: '2021-01-01T00:00:00.000Z',
    })
    expect(result.company_id).toBeUndefined()
    expect(result.deal_id).toBeUndefined()
    expect(result.metadata).toEqual(raw)
  })

  it('maps a company entity to company_id', () => {
    const raw = documentedNote()
    raw.entity = {
      id: 'com_92346499-30bf-4278-ae8e-4aa3ae2ace2c',
      entityType: 'company',
      fullName: 'Tech Corp',
    }
    const result = NoteSchema.parse(transformNote(raw))
    expect(result.company_id).toBe('com_92346499-30bf-4278-ae8e-4aa3ae2ace2c')
    expect(result.contact_id).toBeUndefined()
  })

  it('does not guess a deal for an `object` entity', () => {
    const raw = documentedNote()
    raw.entity = {
      id: 'obj_183ed5cc-3182-45de-84d1-d520f2604810',
      entityType: 'object',
      fullName: 'Project Alpha',
    }
    const result = NoteSchema.parse(transformNote(raw))
    expect(result.contact_id).toBeUndefined()
    expect(result.company_id).toBeUndefined()
    expect(result.deal_id).toBeUndefined()
  })

  it('has no owner for an assistant author', () => {
    const raw = documentedNote()
    raw.author = { type: 'assistant', fullName: 'Research assistant' }
    expect(NoteSchema.parse(transformNote(raw)).owner_id).toBeUndefined()
  })

  it('omits created_at when the documented nullable createdAt is null', () => {
    const raw = { ...documentedNote(), createdAt: null }
    expect(NoteSchema.parse(transformNote(raw)).created_at).toBeUndefined()
  })

  it('untransformNote maps content and contactId', () => {
    const result = untransformNote({ content: 'hi', contact_id: 'c1' })
    expect(result.content).toBe('hi')
    expect(result.contactId).toBe('c1')
  })
})
