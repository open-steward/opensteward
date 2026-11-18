import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote } from '../../../../../../../src/verticals/crm/adapters/spotler-crm/transform/note'
import type { RawSpotlerNote } from '../../../../../../../src/verticals/crm/adapters/spotler-crm/transform/note'

function makeRaw(overrides: Partial<RawSpotlerNote> = {}): RawSpotlerNote {
  return { id: 1, ...overrides }
}

describe('spotler-crm transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })
  it('maps content from description', () => {
    expect(transformNote(makeRaw({ description: 'Note text' })).content).toBe('Note text')
  })
  it('maps company_id from accountid', () => {
    expect(transformNote(makeRaw({ accountid: 42 })).company_id).toBe('42')
  })
  it('maps contact_id from contactid', () => {
    expect(transformNote(makeRaw({ contactid: 99 })).contact_id).toBe('99')
  })
  it('handles null accountid', () => {
    expect(transformNote(makeRaw({ accountid: null })).company_id).toBeUndefined()
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'Test', company_id: '5' })
    expect(result.description).toBe('Test')
    expect(result.accountid).toBe(5)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
