import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawMauticNote } from '../../../../../../../src/verticals/crm/adapters/mautic/transform/note'

function makeRaw(overrides: Partial<RawMauticNote> = {}): RawMauticNote {
  return { id: '1', ...overrides }
}

describe('mautic transformNote', () => {
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

  it('maps contact_id from lead.id', () => {
    const result = transformNote(makeRaw({ lead: { id: 'L1' } }))
    expect(result.contact_id).toBe('L1')
  })

  it('maps created_at from dateTime', () => {
    const result = transformNote(makeRaw({ dateTime: '2024-06-01' }))
    expect(result.created_at).toBe('2024-06-01')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'Test note', contact_id: 'L1' })
    expect(result).toBeDefined()
    expect(result.text).toBe('Test note')
    expect((result.lead as { id: string }).id).toBe('L1')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
