import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawAffinityNote } from '../../../../../../../src/verticals/crm/adapters/affinity/transform/note'

function makeRaw(overrides: Partial<RawAffinityNote> = {}): RawAffinityNote {
  return { id: 1, content: 'Hello', ...overrides }
}

describe('affinity transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })

  it('maps content', () => {
    expect(transformNote(makeRaw()).content).toBe('Hello')
  })

  it('maps contact_id from first person_id', () => {
    expect(transformNote(makeRaw({ person_ids: [9] })).contact_id).toBe('9')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransformNote maps contact_id to person_ids array', () => {
    const result = untransformNote({ contact_id: '3' })
    expect(result.person_ids).toEqual([3])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
