/**
 * The fixture is the documented comments/modify example response data from
 * https://api.scoro.com/api/v2.
 */
import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
} from '../../../../../../../src/verticals/crm/adapters/scoro/transform/note'

const DOC_COMMENT = {
  comment_id: 1,
  parent_id: 0,
  comment: 'Example',
  user_id: 1,
  modified_date: '2020-12-29T11:16:39+02:00',
  permissions: null,
  custom_fields: null,
}

describe('scoro transformNote', () => {
  it('maps the documented example and parses with NoteSchema', () => {
    const note = NoteSchema.parse(transformNote(DOC_COMMENT))
    expect(note).toMatchObject({
      id: '1',
      content: 'Example',
      owner_id: '1',
      updated_at: '2020-12-29T11:16:39+02:00',
    })
    expect(note.metadata).toEqual(DOC_COMMENT)
  })

  it('throws instead of inventing content or an id', () => {
    expect(() => transformNote({ comment_id: 1 })).toThrow(/no comment content/)
    expect(() => transformNote({ comment: 'x' })).toThrow(/no id/)
  })

  it('untransformNote keeps its (unrebuilt) write shape', () => {
    expect(untransformNote({ content: 'c' })).toEqual({ content: 'c' })
  })
})
