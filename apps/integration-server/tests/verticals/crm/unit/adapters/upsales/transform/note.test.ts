import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawUpsalesNote } from '../../../../../../../src/verticals/crm/adapters/upsales/transform/note'

function makeRaw(overrides: Partial<RawUpsalesNote> = {}): RawUpsalesNote {
  return { id: 1, ...overrides }
}

describe('upsales transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })

  it('maps content from description', () => {
    expect(transformNote(makeRaw({ description: 'hello' })).content).toBe('hello')
  })

  it('maps contact_id from contactId', () => {
    expect(transformNote(makeRaw({ contactId: 5 })).contact_id).toBe('5')
  })

  it('maps company_id from clientId', () => {
    expect(transformNote(makeRaw({ clientId: 3 })).company_id).toBe('3')
  })

  it('maps deal_id from opportunityId', () => {
    expect(transformNote(makeRaw({ opportunityId: 9 })).deal_id).toBe('9')
  })

  it('maps owner_id from userId', () => {
    expect(transformNote(makeRaw({ userId: 7 })).owner_id).toBe('7')
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
    expect(result.description).toBe('note text')
    expect(result.contactId).toBe(5)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
