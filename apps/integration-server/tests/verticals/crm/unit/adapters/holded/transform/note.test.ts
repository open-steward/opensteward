import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawHoldedNote } from '../../../../../../../src/verticals/crm/adapters/holded/transform/note'

function makeRaw(overrides: Partial<RawHoldedNote> = {}): RawHoldedNote {
  return { id: '1', ...overrides }
}

describe('holded transformNote', () => {
  it('maps id', () => {
    const result = transformNote(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps content from text', () => {
    const result = transformNote(makeRaw({ text: 'Meeting notes' }))
    expect(result.content).toBe('Meeting notes')
  })

  it('defaults content to empty string', () => {
    const result = transformNote(makeRaw())
    expect(result.content).toBe('')
  })

  it('maps contact_id from contactId', () => {
    const result = transformNote(makeRaw({ contactId: 'c1' }))
    expect(result.contact_id).toBe('c1')
  })

  it('converts unix timestamp created_at to ISO string', () => {
    const result = transformNote(makeRaw({ created: 1700000000 }))
    expect(result.created_at).toBeDefined()
    expect(result.created_at).toContain('2023')
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
