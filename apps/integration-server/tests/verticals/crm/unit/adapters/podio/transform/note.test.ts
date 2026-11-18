import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  type RawPodioComment,
} from '../../../../../../../src/verticals/crm/adapters/podio/transform/note'

function makeRaw(overrides: Partial<RawPodioComment> = {}): RawPodioComment {
  return { id: 1, ...overrides }
}

describe('podio transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps content from value', () => {
    expect(transformNote(makeRaw({ value: 'A comment' })).content).toBe('A comment')
  })

  it('maps owner_id from created_by.id', () => {
    const result = transformNote(makeRaw({ created_by: { id: 10 } }))
    expect(result.owner_id).toBe('10')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: 5 }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
