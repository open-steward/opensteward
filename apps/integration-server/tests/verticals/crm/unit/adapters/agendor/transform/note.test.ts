import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawAgendorNote } from '../../../../../../../src/verticals/crm/adapters/agendor/transform/note'

function makeRaw(overrides: Partial<RawAgendorNote> = {}): RawAgendorNote {
  return { id: 1, ...overrides }
}

describe('agendor transformNote', () => {
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

  it('maps contact_id from person.id', () => {
    const result = transformNote(makeRaw({ person: { id: 10 } }))
    expect(result.contact_id).toBe('10')
  })

  it('maps deal_id from deal.id', () => {
    const result = transformNote(makeRaw({ deal: { id: 20 } }))
    expect(result.deal_id).toBe('20')
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
