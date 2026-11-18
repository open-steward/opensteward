import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, type RawSansanNote } from '../../../../../../../src/verticals/crm/adapters/sansan/transform/note'

function makeRaw(overrides: Partial<RawSansanNote> = {}): RawSansanNote {
  return { id: 'N1', ...overrides }
}

describe('sansan transformNote (placeholder)', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw()).id).toBe('N1')
  })

  it('maps content field', () => {
    expect(transformNote(makeRaw({ content: 'some note' })).content).toBe('some note')
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
