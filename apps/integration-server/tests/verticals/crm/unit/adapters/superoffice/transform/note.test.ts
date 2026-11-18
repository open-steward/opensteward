import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote } from '../../../../../../../src/verticals/crm/adapters/superoffice/transform/note'
import type { RawSuperofficeNote } from '../../../../../../../src/verticals/crm/adapters/superoffice/transform/note'

function makeRaw(overrides: Partial<RawSuperofficeNote> = {}): RawSuperofficeNote {
  return { AppointmentId: 1, ...overrides }
}

describe('superoffice transformNote', () => {
  it('maps id from AppointmentId', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })
  it('falls back to DocumentId for id', () => {
    expect(transformNote({ DocumentId: 5 }).id).toBe('5')
  })
  it('maps content from Description', () => {
    expect(transformNote(makeRaw({ Description: 'A note' })).content).toBe('A note')
  })
  it('maps company_id from Contact.ContactId', () => {
    expect(transformNote(makeRaw({ Contact: { ContactId: 42 } })).company_id).toBe('42')
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
    expect(result.Description).toBe('Test')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
