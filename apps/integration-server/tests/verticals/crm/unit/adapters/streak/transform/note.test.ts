import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawStreakComment } from '../../../../../../../src/verticals/crm/adapters/streak/transform/note'

function makeRaw(overrides: Partial<RawStreakComment> = {}): RawStreakComment {
  return { key: 'comment1', ...overrides }
}

describe('streak transformNote', () => {
  it('maps key to id', () => {
    expect(transformNote(makeRaw()).id).toBe('comment1')
  })

  it('maps message to content', () => {
    expect(transformNote(makeRaw({ message: 'Follow up done' })).content).toBe('Follow up done')
  })

  it('maps _boxKey to deal_id', () => {
    expect(transformNote(makeRaw({ _boxKey: 'box42' })).deal_id).toBe('box42')
  })

  it('maps creatorKey to owner_id', () => {
    expect(transformNote(makeRaw({ creatorKey: 'usr1' })).owner_id).toBe('usr1')
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

describe('streak untransformNote', () => {
  it('maps content to message', () => {
    expect(untransformNote({ content: 'text' }).message).toBe('text')
  })
})
