import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawBiginNote } from '../../../../../../../src/verticals/crm/adapters/zoho-bigin/transform/note'

function makeRaw(overrides: Partial<RawBiginNote> = {}): RawBiginNote {
  return { id: '1', ...overrides }
}

describe('zoho-bigin transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })

  it('maps content from Note_Content', () => {
    expect(transformNote(makeRaw({ Note_Content: 'hello' })).content).toBe('hello')
  })

  it('maps contact_id from Contact_Id.id', () => {
    expect(transformNote(makeRaw({ Contact_Id: { id: '5' } })).contact_id).toBe('5')
  })

  it('maps deal_id from Parent_Id.id', () => {
    expect(transformNote(makeRaw({ Parent_Id: { id: '9' } })).deal_id).toBe('9')
  })

  it('maps owner_id from Owner.id', () => {
    expect(transformNote(makeRaw({ Owner: { id: '7' } })).owner_id).toBe('7')
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
    expect(result.Note_Content).toBe('note text')
    expect((result.Contact_Id as Record<string, unknown>).id).toBe('5')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
