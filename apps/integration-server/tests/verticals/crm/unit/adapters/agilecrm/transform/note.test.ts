import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawAgileCrmNote } from '../../../../../../../src/verticals/crm/adapters/agilecrm/transform/note'

function makeRaw(overrides: Partial<RawAgileCrmNote> = {}): RawAgileCrmNote {
  return { id: 1, ...overrides }
}

describe('agilecrm transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })

  it('uses description as content', () => {
    expect(transformNote(makeRaw({ description: 'desc' })).content).toBe('desc')
  })

  it('falls back to subject when no description', () => {
    expect(transformNote(makeRaw({ subject: 'subj' })).content).toBe('subj')
  })

  it('maps contact_id from contact_json', () => {
    expect(transformNote(makeRaw({ contact_json: { id: 99 } })).contact_id).toBe('99')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransformNote maps content to subject and description', () => {
    const result = untransformNote({ content: 'hi' })
    expect(result.subject).toBe('hi')
    expect(result.description).toBe('hi')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
