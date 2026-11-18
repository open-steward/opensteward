import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawAttioNote } from '../../../../../../../src/verticals/crm/adapters/attio/transform/note'

function makeRaw(overrides: Partial<RawAttioNote> = {}): RawAttioNote {
  return { id: { note_id: 'note1' }, ...overrides }
}

describe('attio transformNote', () => {
  it('maps id from note_id', () => {
    expect(transformNote(makeRaw()).id).toBe('note1')
  })

  it('maps content from content_plaintext', () => {
    expect(transformNote(makeRaw({ content_plaintext: 'Hello' })).content).toBe('Hello')
  })

  it('maps contact_id when parent_object is people', () => {
    const result = transformNote(makeRaw({ parent_object: 'people', parent_record_id: 'p1' }))
    expect(result.contact_id).toBe('p1')
    expect(result.deal_id).toBeUndefined()
  })

  it('maps deal_id when parent_object is deals', () => {
    const result = transformNote(makeRaw({ parent_object: 'deals', parent_record_id: 'd1' }))
    expect(result.deal_id).toBe('d1')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransformNote sets parent_object for contact', () => {
    const result = untransformNote({ content: 'hi', contact_id: 'p1' }) as { data: Record<string, unknown> }
    expect(result.data['parent_object']).toBe('people')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
