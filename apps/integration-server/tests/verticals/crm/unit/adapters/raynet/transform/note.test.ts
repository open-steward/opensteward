import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote } from '../../../../../../../src/verticals/crm/adapters/raynet/transform/note'
import type { RawRaynetNote } from '../../../../../../../src/verticals/crm/adapters/raynet/transform/note'

function makeRaw(overrides: Partial<RawRaynetNote> = {}): RawRaynetNote {
  return { id: 1, ...overrides }
}

describe('raynet transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })
  it('maps content from text', () => {
    expect(transformNote(makeRaw({ text: 'A note' })).content).toBe('A note')
  })
  it('maps contact_id from nested contact', () => {
    expect(transformNote(makeRaw({ contact: { id: 42 } })).contact_id).toBe('42')
  })
  it('maps deal_id from businessCase', () => {
    expect(transformNote(makeRaw({ businessCase: { id: 7 } })).deal_id).toBe('7')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'Note text' })
    expect(result.text).toBe('Note text')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
