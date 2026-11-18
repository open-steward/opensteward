import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawKylasNote } from '../../../../../../../src/verticals/crm/adapters/kylas/transform/note'

function makeRaw(overrides: Partial<RawKylasNote> = {}): RawKylasNote {
  return { id: 1, ...overrides }
}

describe('kylas transformNote', () => {
  it('maps id', () => {
    const result = transformNote(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps content', () => {
    const result = transformNote(makeRaw({ content: 'Meeting notes' }))
    expect(result.content).toBe('Meeting notes')
  })

  it('falls back to description when content is missing', () => {
    const result = transformNote(makeRaw({ description: 'Desc' }))
    expect(result.content).toBe('Desc')
  })

  it('maps contact_id from contactId', () => {
    const result = transformNote(makeRaw({ contactId: 5 }))
    expect(result.contact_id).toBe('5')
  })

  it('maps owner_id from ownedBy.id', () => {
    const result = transformNote(makeRaw({ ownedBy: { id: 3 } }))
    expect(result.owner_id).toBe('3')
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
    expect(result.content).toBe('Test note')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
