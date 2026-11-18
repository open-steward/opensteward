import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawCreatioNote } from '../../../../../../../src/verticals/crm/adapters/creatio/transform/note'

function makeRaw(overrides: Partial<RawCreatioNote> = {}): RawCreatioNote {
  return { Id: 'n1', ...overrides }
}

describe('creatio transformNote', () => {
  it('maps Id to id string', () => {
    expect(transformNote(makeRaw()).id).toBe('n1')
  })

  it('uses Notes as content', () => {
    expect(transformNote(makeRaw({ Notes: 'Text' })).content).toBe('Text')
  })

  it('falls back to Title when no Notes', () => {
    expect(transformNote(makeRaw({ Title: 'Title' })).content).toBe('Title')
  })

  it('maps contact_id from ContactId', () => {
    expect(transformNote(makeRaw({ ContactId: 'c1' })).contact_id).toBe('c1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransformNote maps content to Notes', () => {
    expect(untransformNote({ content: 'hi' }).Notes).toBe('hi')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
