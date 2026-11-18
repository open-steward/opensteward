import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawSalesmateNote } from '../../../../../../../src/verticals/crm/adapters/salesmate/transform/note'

function makeRaw(overrides: Partial<RawSalesmateNote> = {}): RawSalesmateNote {
  return { id: '5', ...overrides }
}

describe('salesmate transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw()).id).toBe('5')
  })

  it('uses note field as content', () => {
    expect(transformNote(makeRaw({ note: 'Note text' })).content).toBe('Note text')
  })

  it('falls back to content field', () => {
    expect(transformNote(makeRaw({ content: 'Content text' })).content).toBe('Content text')
  })

  it('maps deal to deal_id', () => {
    expect(transformNote(makeRaw({ deal: '20' })).deal_id).toBe('20')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('salesmate untransformNote', () => {
  it('maps content to note', () => {
    expect(untransformNote({ content: 'text' }).note).toBe('text')
  })
})
