import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
} from '../../../../../../../src/verticals/crm/adapters/twenty/transform/note'
import { NOTE } from '../fixtures'

describe('twenty transformNote', () => {
  it('maps a documented Note record to a schema-valid Note', () => {
    const out = NoteSchema.parse(transformNote(NOTE))
    expect(out).toMatchObject({
      id: NOTE.id,
      content: 'Follow up on Q1 expansion',
      owner_id: NOTE.createdBy.workspaceMemberId,
      created_at: NOTE.createdAt,
      updated_at: NOTE.updatedAt,
    })
    expect(out.metadata).toEqual(NOTE)
  })

  it('an empty body is empty content', () => {
    const out = NoteSchema.parse(transformNote({ ...NOTE, bodyV2: null }))
    expect(out.content).toBe('')
  })

  it('a note created by an API key has no owner', () => {
    const out = NoteSchema.parse(
      transformNote({
        ...NOTE,
        createdBy: { source: 'API', workspaceMemberId: null, name: 'key', context: {} },
      }),
    )
    expect(out.owner_id).toBeUndefined()
  })

  it('refuses a record without an id', () => {
    expect(() => transformNote({ ...NOTE, id: undefined })).toThrow(/id/)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'note text' })
    expect(result.body).toBe('note text')
  })
})
