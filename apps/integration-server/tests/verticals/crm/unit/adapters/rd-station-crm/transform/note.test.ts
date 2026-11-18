import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote } from '../../../../../../../src/verticals/crm/adapters/rd-station-crm/transform/note'
import type { RawRdStationAnnotation } from '../../../../../../../src/verticals/crm/adapters/rd-station-crm/transform/note'

function makeRaw(overrides: Partial<RawRdStationAnnotation> = {}): RawRdStationAnnotation {
  return { _id: 'note1', ...overrides }
}

describe('rd-station-crm transformNote', () => {
  it('maps id from _id', () => {
    expect(transformNote(makeRaw()).id).toBe('note1')
  })
  it('maps content from text', () => {
    expect(transformNote(makeRaw({ text: 'My note' })).content).toBe('My note')
  })
  it('maps contact_id', () => {
    expect(transformNote(makeRaw({ contact_id: 'c1' })).contact_id).toBe('c1')
  })
  it('handles null contact_id', () => {
    expect(transformNote(makeRaw({ contact_id: null })).contact_id).toBeUndefined()
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
    expect(result.text).toBe('Test note')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
