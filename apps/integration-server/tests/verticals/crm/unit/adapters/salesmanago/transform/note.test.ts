import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote } from '../../../../../../../src/verticals/crm/adapters/salesmanago/transform/note'
import type { RawSaleSmanagoNote } from '../../../../../../../src/verticals/crm/adapters/salesmanago/transform/note'

function makeRaw(overrides: Partial<RawSaleSmanagoNote> = {}): RawSaleSmanagoNote {
  return { id: 'note1', ...overrides }
}

describe('salesmanago transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('note1')
  })
  it('maps content from note field', () => {
    expect(transformNote(makeRaw({ note: 'A note' })).content).toBe('A note')
  })
  it('maps contact_id from contactId', () => {
    expect(transformNote(makeRaw({ contactId: 'c1' })).contact_id).toBe('c1')
  })
  it('maps created_at from epoch ms', () => {
    const ts = new Date('2024-01-01T00:00:00Z').getTime()
    expect(transformNote(makeRaw({ createdOn: ts })).created_at).toBe('2024-01-01T00:00:00.000Z')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'My note' })
    expect(result.note).toBe('My note')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
