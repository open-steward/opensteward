/**
 * Fixture fields are Note.v2.yaml's:
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/Note.v2.yaml
 */
import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  parseNoteId,
  transformNote,
  untransformNote,
  type RawMoskitNote,
} from '../../../../../../../src/verticals/crm/adapters/moskit/transform/note'

function documented(): RawMoskitNote {
  return {
    id: 900,
    description: 'Called, will send proposal',
    dateCreated: '2020-07-08T18:18:50.000+00:00',
    user: { id: 8 },
    source: 'MOSKIT_API_V2',
  }
}

describe('moskit transformNote', () => {
  it('maps a deal note and satisfies the schema', () => {
    const out = NoteSchema.parse(transformNote(documented(), { kind: 'deal', id: '300' }))
    expect(out).toMatchObject({
      id: 'deal:300:900',
      content: 'Called, will send proposal',
      deal_id: '300',
      owner_id: '8',
      created_at: '2020-07-08T18:18:50.000Z',
    })
    expect(out.contact_id).toBeUndefined()
    expect(out.company_id).toBeUndefined()
  })

  it('links contact and company notes to their parent', () => {
    const c = NoteSchema.parse(transformNote(documented(), { kind: 'contact', id: '101' }))
    expect([c.id, c.contact_id, c.deal_id]).toEqual(['contact:101:900', '101', undefined])
    const co = NoteSchema.parse(transformNote(documented(), { kind: 'company', id: '20' }))
    expect([co.id, co.company_id]).toEqual(['company:20:900', '20'])
  })

  it('round-trips its id through parseNoteId', () => {
    const id = transformNote(documented(), { kind: 'company', id: '20' }).id
    expect(parseNoteId(id)).toEqual({ parent: { kind: 'company', id: '20' }, noteId: '900' })
    expect(parseNoteId('900')).toBeUndefined()
  })

  it('parses a record with only the id', () => {
    expect(NoteSchema.parse(transformNote({ id: 1 }, { kind: 'deal', id: '2' })).content).toBe('')
  })

  it('keeps the raw payload as metadata', () => {
    const raw = documented()
    expect(transformNote(raw, { kind: 'deal', id: '1' }).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'note text' })
    expect(result.content).toBe('note text')
  })
})
