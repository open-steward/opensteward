import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote } from '../../../../../../../src/verticals/crm/adapters/solve-crm/transform/note'
import type { RawSolveNote } from '../../../../../../../src/verticals/crm/adapters/solve-crm/transform/note'

function makeRaw(overrides: Partial<RawSolveNote> = {}): RawSolveNote {
  return { id: '1', ...overrides }
}

describe('solve-crm transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })
  it('maps content from description', () => {
    expect(transformNote(makeRaw({ description: 'Note content' })).content).toBe('Note content')
  })
  it('falls back to text for content', () => {
    expect(transformNote(makeRaw({ text: 'Text content' })).content).toBe('Text content')
  })
  it('maps contact_id from contactId', () => {
    expect(transformNote(makeRaw({ contactId: 'c1' })).contact_id).toBe('c1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'Test' })
    expect(result.description).toBe('Test')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
