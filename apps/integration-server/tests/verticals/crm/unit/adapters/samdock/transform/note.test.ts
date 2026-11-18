import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote } from '../../../../../../../src/verticals/crm/adapters/samdock/transform/note'
import type { RawSamdockNote } from '../../../../../../../src/verticals/crm/adapters/samdock/transform/note'

function makeRaw(overrides: Partial<RawSamdockNote> = {}): RawSamdockNote {
  return { id: 'n1', ...overrides }
}

describe('samdock transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('n1')
  })
  it('maps content from text', () => {
    expect(transformNote(makeRaw({ text: 'Note text' })).content).toBe('Note text')
  })
  it('maps contact_id', () => {
    expect(transformNote(makeRaw({ contact_id: 'c1' })).contact_id).toBe('c1')
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
    const result = untransformNote({ content: 'Test' })
    expect(result.text).toBe('Test')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
