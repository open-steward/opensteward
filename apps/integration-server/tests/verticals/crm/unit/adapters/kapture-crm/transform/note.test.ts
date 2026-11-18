import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawKaptureNote,
} from '../../../../../../../src/verticals/crm/adapters/kapture-crm/transform/note'

function makeRaw(overrides: Partial<RawKaptureNote> = {}): RawKaptureNote {
  return { ...overrides }
}

describe('kapture-crm transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: '4' })).id).toBe('4')
  })

  it('uses content field', () => {
    expect(transformNote(makeRaw({ content: 'Content text' })).content).toBe('Content text')
  })

  it('falls back to note field', () => {
    expect(transformNote(makeRaw({ note: 'Note text' })).content).toBe('Note text')
  })

  it('defaults content to empty string', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: '4' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('kapture-crm untransformNote', () => {
  it('maps content', () => {
    const result = untransformNote({ content: 'A note' })
    expect(result.content).toBe('A note')
  })
})
