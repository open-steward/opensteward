import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote } from '../../../../../../../src/verticals/crm/adapters/qiscus/transform/note'
import type { RawQiscusNote } from '../../../../../../../src/verticals/crm/adapters/qiscus/transform/note'

function makeRaw(overrides: Partial<RawQiscusNote> = {}): RawQiscusNote {
  return { id: '1', ...overrides }
}

describe('qiscus transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })
  it('maps content', () => {
    expect(transformNote(makeRaw({ content: 'A note' })).content).toBe('A note')
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
    expect(result).toBeDefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
