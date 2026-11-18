import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawBexioNote } from '../../../../../../../src/verticals/crm/adapters/bexio/transform/note'

function makeRaw(overrides: Partial<RawBexioNote> = {}): RawBexioNote {
  return { id: 1, ...overrides }
}

describe('bexio transformNote', () => {
  it('maps id', () => {
    const result = transformNote(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps content from text', () => {
    const result = transformNote(makeRaw({ text: 'Meeting notes' }))
    expect(result.content).toBe('Meeting notes')
  })

  it('defaults content to empty string when text is missing', () => {
    const result = transformNote(makeRaw())
    expect(result.content).toBe('')
  })

  it('maps contact_id', () => {
    const result = transformNote(makeRaw({ contact_id: 5 }))
    expect(result.contact_id).toBe('5')
  })

  it('maps owner_id from user_id', () => {
    const result = transformNote(makeRaw({ user_id: 8 }))
    expect(result.owner_id).toBe('8')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'Test note' })
    expect(result).toBeDefined()
    expect(result.text).toBe('Test note')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
