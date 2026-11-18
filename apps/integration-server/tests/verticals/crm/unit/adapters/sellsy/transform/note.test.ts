import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote } from '../../../../../../../src/verticals/crm/adapters/sellsy/transform/note'
import type { RawSellsyNote } from '../../../../../../../src/verticals/crm/adapters/sellsy/transform/note'

function makeRaw(overrides: Partial<RawSellsyNote> = {}): RawSellsyNote {
  return { id: 1, ...overrides }
}

describe('sellsy transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })
  it('maps content', () => {
    expect(transformNote(makeRaw({ content: 'A note' })).content).toBe('A note')
  })
  it('maps contact_id from linked_contacts_ids[0]', () => {
    expect(transformNote(makeRaw({ linked_contacts_ids: [42] })).contact_id).toBe('42')
  })
  it('maps company_id from linked_companies_ids[0]', () => {
    expect(transformNote(makeRaw({ linked_companies_ids: [99] })).company_id).toBe('99')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'Test', contact_id: '5' })
    expect(result.content).toBe('Test')
    expect(result.linked_contacts_ids).toEqual(['5'])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
