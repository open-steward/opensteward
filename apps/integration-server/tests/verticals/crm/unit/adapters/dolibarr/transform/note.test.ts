import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawDolibarrNote } from '../../../../../../../src/verticals/crm/adapters/dolibarr/transform/note'

function makeRaw(overrides: Partial<RawDolibarrNote> = {}): RawDolibarrNote {
  return { id: '1', ...overrides }
}

describe('dolibarr transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })

  it('maps content from note field', () => {
    expect(transformNote(makeRaw({ note: 'Text' })).content).toBe('Text')
  })

  it('maps contact_id from fk_contact', () => {
    expect(transformNote(makeRaw({ fk_contact: '5' })).contact_id).toBe('5')
  })

  it('maps company_id from fk_soc', () => {
    expect(transformNote(makeRaw({ fk_soc: '3' })).company_id).toBe('3')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransformNote maps content to note_private', () => {
    expect(untransformNote({ content: 'hi' }).note_private).toBe('hi')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
