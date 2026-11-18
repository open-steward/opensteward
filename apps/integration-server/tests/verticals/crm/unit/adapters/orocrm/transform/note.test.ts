import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
} from '../../../../../../../src/verticals/crm/adapters/orocrm/transform/note'
import type { JsonApiRecord } from '../../../../../../../src/verticals/crm/adapters/orocrm/client'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRecord(
  attrs: Record<string, unknown> = {},
  rels: JsonApiRecord['relationships'] = {},
): JsonApiRecord {
  return {
    type: 'notes',
    id: 'note_1',
    attributes: {
      message: 'Great meeting, follow up next week',
      createdAt: '2026-01-15T09:30:00.000Z',
      updatedAt: '2026-02-01T14:20:00.000Z',
      ...attrs,
    },
    relationships: {
      owner: { data: { type: 'users', id: 'usr_5' } },
      ...rels,
    },
  }
}

describe('orocrm transformNote', () => {
  it('maps record.id to string id', () => {
    expect(transformNote(makeRecord()).id).toBe('note_1')
  })

  it('maps message attribute to content', () => {
    expect(transformNote(makeRecord()).content).toBe('Great meeting, follow up next week')
  })

  it('uses empty string when message is absent', () => {
    expect(transformNote(makeRecord({ message: null })).content).toBe('')
  })

  it('maps owner relationship to owner_id', () => {
    expect(transformNote(makeRecord()).owner_id).toBe('usr_5')
  })

  it('maps createdAt / updatedAt', () => {
    const result = transformNote(makeRecord())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('passes NoteSchema validation', () => {
    expect(() => NoteSchema.parse(transformNote(makeRecord()))).not.toThrow()
  })

  it('untransformNote wraps in JSON:API envelope with type "notes"', () => {
    const out = untransformNote({ content: 'Follow up tomorrow' })
    expect((out['data'] as Record<string, unknown>)['type']).toBe('notes')
    const attrs = (out['data'] as Record<string, Record<string, unknown>>)['attributes']
    expect(attrs['message']).toBe('Follow up tomorrow')
  })
})
