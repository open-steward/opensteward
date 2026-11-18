import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawWeclappNote } from '../../../../../../../src/verticals/crm/adapters/weclapp/transform/note'

function makeRaw(overrides: Partial<RawWeclappNote> = {}): RawWeclappNote {
  return { id: '1', ...overrides }
}

describe('weclapp transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })

  it('returns empty content (stub)', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'note text' })
    expect(result.content).toBe('note text')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
