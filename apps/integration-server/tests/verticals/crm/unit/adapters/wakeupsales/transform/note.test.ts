import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawWakeupsalesNote } from '../../../../../../../src/verticals/crm/adapters/wakeupsales/transform/note'

function makeRaw(overrides: Partial<RawWakeupsalesNote> = {}): RawWakeupsalesNote {
  return { id: 'WUNOTE1', ...overrides }
}

describe('wakeupsales transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw()).id).toBe('WUNOTE1')
  })

  it('uses content field', () => {
    expect(transformNote(makeRaw({ content: 'Content' })).content).toBe('Content')
  })

  it('falls back to note field when content absent', () => {
    expect(transformNote(makeRaw({ note: 'Note text' })).content).toBe('Note text')
  })

  it('maps deal_id', () => {
    expect(transformNote(makeRaw({ deal_id: 'D1' })).deal_id).toBe('D1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('wakeupsales untransformNote', () => {
  it('maps content back', () => {
    expect(untransformNote({ content: 'note' }).content).toBe('note')
  })
})
