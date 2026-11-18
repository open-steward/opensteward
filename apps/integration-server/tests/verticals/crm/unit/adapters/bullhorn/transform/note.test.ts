import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawBullhornNote } from '../../../../../../../src/verticals/crm/adapters/bullhorn/transform/note'

function makeRaw(overrides: Partial<RawBullhornNote> = {}): RawBullhornNote {
  return { id: 1, ...overrides }
}

describe('bullhorn transformNote', () => {
  it('maps id', () => {
    const result = transformNote(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps content from comments', () => {
    const result = transformNote(makeRaw({ comments: 'Meeting notes' }))
    expect(result.content).toBe('Meeting notes')
  })

  it('defaults content to empty string', () => {
    const result = transformNote(makeRaw())
    expect(result.content).toBe('')
  })

  it('maps contact_id from clientContact.id', () => {
    const result = transformNote(makeRaw({ clientContact: { id: 5 } }))
    expect(result.contact_id).toBe('5')
  })

  it('maps company_id from clientCorporation.id', () => {
    const result = transformNote(makeRaw({ clientCorporation: { id: 8 } }))
    expect(result.company_id).toBe('8')
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
    expect(result.comments).toBe('Test note')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
