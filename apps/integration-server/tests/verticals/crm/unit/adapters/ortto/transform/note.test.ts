import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawOrttoNote,
} from '../../../../../../../src/verticals/crm/adapters/ortto/transform/note'

function makeRaw(overrides: Partial<RawOrttoNote> = {}): RawOrttoNote {
  return { id: 'note-1', ...overrides }
}

describe('ortto transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 'note-5' })).id).toBe('note-5')
  })

  it('returns empty content (stub behaviour)', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: 'note-5' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('ortto untransformNote', () => {
  it('maps content', () => {
    const result = untransformNote({ content: 'A note' })
    expect(result.content).toBe('A note')
  })
})
