import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawApptivoNote } from '../../../../../../../src/verticals/crm/adapters/apptivo/transform/note'

function makeRaw(overrides: Partial<RawApptivoNote> = {}): RawApptivoNote {
  return { noteId: '1', ...overrides }
}

describe('apptivo transformNote', () => {
  it('maps id from noteId', () => {
    const result = transformNote(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps content from description', () => {
    const result = transformNote(makeRaw({ description: 'Meeting notes' }))
    expect(result.content).toBe('Meeting notes')
  })

  it('falls back to text when description is missing', () => {
    const result = transformNote(makeRaw({ text: 'Fallback' }))
    expect(result.content).toBe('Fallback')
  })

  it('maps company_id from customerId', () => {
    const result = transformNote(makeRaw({ customerId: 'c1' }))
    expect(result.company_id).toBe('c1')
  })

  it('maps deal_id from opportunityId', () => {
    const result = transformNote(makeRaw({ opportunityId: 'o1' }))
    expect(result.deal_id).toBe('o1')
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
    expect(result.description).toBe('Test note')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
