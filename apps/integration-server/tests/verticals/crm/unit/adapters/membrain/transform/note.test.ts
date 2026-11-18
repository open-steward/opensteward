import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
} from '../../../../../../../src/verticals/crm/adapters/membrain/transform/note'
import { DOC_NOTE } from '../fixtures/docs'

describe('membrain transformNote', () => {
  it('maps a Note activity', () => {
    const out = NoteSchema.parse(transformNote(DOC_NOTE))
    expect(out).toMatchObject({
      id: 'e74ae670-0cf3-4d44-9b2a-7a6bcba1b517',
      content: 'Hello Dania, I hope everything is well!',
      company_id: '5c34b42e-92e4-470b-87b1-2191eed55e6c',
      deal_id: 'fa6f9364-b0aa-4bdc-b15c-c57aef87f3ad',
    })
    expect(out.metadata).toEqual(DOC_NOTE)
  })

  it('keeps empty Contents as an empty note', () => {
    expect(NoteSchema.parse(transformNote({ ...DOC_NOTE, Contents: '' })).content).toBe('')
  })

  it('refuses a note with no Contents instead of inventing text', () => {
    const { Contents: _omit, ...noContents } = DOC_NOTE
    expect(() => transformNote(noContents as unknown as typeof DOC_NOTE)).toThrow(/no Contents/)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'note text' })
    expect(result.content).toBe('note text')
  })
})
