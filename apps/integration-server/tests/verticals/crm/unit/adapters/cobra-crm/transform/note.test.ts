import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawCobraCrmNote } from '../../../../../../../src/verticals/crm/adapters/cobra-crm/transform/note'

function makeRaw(overrides: Partial<RawCobraCrmNote> = {}): RawCobraCrmNote {
  return { id: '1', ...overrides }
}

describe('cobra-crm transformNote', () => {
  it('maps id', () => {
    const result = transformNote(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps content', () => {
    const result = transformNote(makeRaw({ content: 'Meeting notes' }))
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

  it('maps deal_id from dealId', () => {
    const result = transformNote(makeRaw({ dealId: 'd1' }))
    expect(result.deal_id).toBe('d1')
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
