import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote } from '../../../../../../../src/verticals/crm/adapters/pipedrive/transform/note'
import type { RawPipedriveNote } from '../../../../../../../src/verticals/crm/adapters/pipedrive/transform/note'

function makeRaw(overrides: Partial<RawPipedriveNote> = {}): RawPipedriveNote {
  return { id: 1, content: 'A note', ...overrides }
}

describe('pipedrive transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })
  it('maps content', () => {
    expect(transformNote(makeRaw({ content: 'Test note' })).content).toBe('Test note')
  })
  it('maps contact_id from person_id', () => {
    expect(transformNote(makeRaw({ person_id: 42 })).contact_id).toBe('42')
  })
  it('handles null person_id', () => {
    expect(transformNote(makeRaw({ person_id: null })).contact_id).toBeUndefined()
  })
  it('maps owner_id from nested user', () => {
    expect(transformNote(makeRaw({ user: { id: 7 } })).owner_id).toBe('7')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'Hello', contact_id: '5' })
    expect(result.content).toBe('Hello')
    expect(result.person_id).toBe(5)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
