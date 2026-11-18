import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawBarantumNote,
} from '../../../../../../../src/verticals/crm/adapters/barantum/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { DOC_NOTE } from '../fixtures/documented'

const doc = (overrides: Partial<RawBarantumNote> = {}): RawBarantumNote => ({
  ...DOC_NOTE,
  ...overrides,
})

describe('barantum transformNote (documented Notes row)', () => {
  it('parses against NoteSchema', () => {
    const n = NoteSchema.parse(transformNote(doc()))
    expect(n.id).toBe('d157f24a-61e1-4732-b30a-588009afe9f8')
    expect(n.content).toBe('')
    expect(n.company_id).toBe('d4e2a745-82fa-4b58-8490-f682bff30959')
    expect(n.contact_id).toBeUndefined()
    expect(n.deal_id).toBeUndefined()
    expect(n.created_at).toBeUndefined()
    expect(n.metadata).toEqual(DOC_NOTE)
  })

  it('reads content from notes_description, the documented note content', () => {
    const n = NoteSchema.parse(transformNote(doc({ notes_description: 'Lorem API Test 1' })))
    expect(n.content).toBe('Lorem API Test 1')
  })

  it('maps set contact and deal relations', () => {
    const n = NoteSchema.parse(
      transformNote(doc({ related_contacts_uuid: 'c-uuid', related_deals_uuid: 'd-uuid' })),
    )
    expect(n.contact_id).toBe('c-uuid')
    expect(n.deal_id).toBe('d-uuid')
  })

  it('throws on a row with no notes_uuid', () => {
    expect(() => transformNote(doc({ notes_uuid: '-' }))).toThrow(/notes_uuid/)
  })
})

describe('barantum untransformNote', () => {
  it('maps content back', () => {
    expect(untransformNote({ content: 'A note body' }).content).toBe('A note body')
  })

  it('maps contact_id back', () => {
    expect(untransformNote({ contact_id: '55' }).contact_id).toBe('55')
  })

  it('maps company_id back', () => {
    expect(untransformNote({ company_id: '66' }).company_id).toBe('66')
  })

  it('maps deal_id back', () => {
    expect(untransformNote({ deal_id: '77' }).deal_id).toBe('77')
  })
})
