import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawCapsuleNote } from '../../../../../../../src/verticals/crm/adapters/capsule/transform/note'

function makeRaw(overrides: Partial<RawCapsuleNote> = {}): RawCapsuleNote {
  return { id: 1, ...overrides }
}

describe('capsule transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })

  it('maps content', () => {
    expect(transformNote(makeRaw({ content: 'Note text' })).content).toBe('Note text')
  })

  it('maps contact_id from party', () => {
    expect(transformNote(makeRaw({ party: { id: 9 } })).contact_id).toBe('9')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransformNote maps content', () => {
    const result = untransformNote({ content: 'hello' })
    expect(result.content).toBe('hello')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
