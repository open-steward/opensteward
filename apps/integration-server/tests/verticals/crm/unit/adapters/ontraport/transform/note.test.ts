import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote } from '../../../../../../../src/verticals/crm/adapters/ontraport/transform/note'
import type { RawOntraportNote } from '../../../../../../../src/verticals/crm/adapters/ontraport/transform/note'

function makeRaw(overrides: Partial<RawOntraportNote> = {}): RawOntraportNote {
  return { id: '1', ...overrides }
}

describe('ontraport transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })
  it('maps content from message', () => {
    expect(transformNote(makeRaw({ message: 'Important note' })).content).toBe('Important note')
  })
  it('maps contact_id', () => {
    expect(transformNote(makeRaw({ contact_id: '42' })).contact_id).toBe('42')
  })
  it('handles null contact_id', () => {
    expect(transformNote(makeRaw({ contact_id: null })).contact_id).toBeUndefined()
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
    expect(result.message).toBe('Test note')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
