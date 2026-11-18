import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawActNote } from '../../../../../../../src/verticals/crm/adapters/act-crm/transform/note'

function makeRaw(overrides: Partial<RawActNote> = {}): RawActNote {
  return { id: '1', ...overrides }
}

describe('act-crm transformNote', () => {
  it('maps id', () => {
    const result = transformNote(makeRaw())
    expect(result.id).toBe('1')
  })

  it('falls back to noteId when id is missing', () => {
    const result = transformNote(makeRaw({ id: undefined, noteId: '55' }))
    expect(result.id).toBe('55')
  })

  it('maps content from noteText', () => {
    const result = transformNote(makeRaw({ noteText: 'Important note' }))
    expect(result.content).toBe('Important note')
  })

  it('falls back to text when noteText is missing', () => {
    const result = transformNote(makeRaw({ text: 'Fallback text' }))
    expect(result.content).toBe('Fallback text')
  })

  it('maps contact_id', () => {
    const result = transformNote(makeRaw({ contactId: 'c1' }))
    expect(result.contact_id).toBe('c1')
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
    expect(result.noteText).toBe('Test note')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
