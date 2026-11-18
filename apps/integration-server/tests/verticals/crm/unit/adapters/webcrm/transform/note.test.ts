import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawWebcrmNote } from '../../../../../../../src/verticals/crm/adapters/webcrm/transform/note'

function makeRaw(overrides: Partial<RawWebcrmNote> = {}): RawWebcrmNote {
  return { ...overrides }
}

describe('webcrm transformNote', () => {
  it('maps id from NoteId', () => {
    expect(transformNote(makeRaw({ NoteId: 1 })).id).toBe('1')
  })

  it('maps content from NoteContent', () => {
    expect(transformNote(makeRaw({ NoteContent: 'hello' })).content).toBe('hello')
  })

  it('maps contact_id from PersonId', () => {
    expect(transformNote(makeRaw({ PersonId: 5 })).contact_id).toBe('5')
  })

  it('maps company_id from OrganisationId', () => {
    expect(transformNote(makeRaw({ OrganisationId: 3 })).company_id).toBe('3')
  })

  it('maps deal_id from OpportunityId', () => {
    expect(transformNote(makeRaw({ OpportunityId: 9 })).deal_id).toBe('9')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'note text', contact_id: '5' })
    expect(result.NoteContent).toBe('note text')
    expect(result.PersonId).toBe(5)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ NoteId: 1 }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
