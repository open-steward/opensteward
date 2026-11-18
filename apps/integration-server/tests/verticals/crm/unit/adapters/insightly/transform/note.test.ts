import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawInsightlyNote,
} from '../../../../../../../src/verticals/crm/adapters/insightly/transform/note'

function makeRaw(overrides: Partial<RawInsightlyNote> = {}): RawInsightlyNote {
  return { NOTE_ID: 1, ...overrides }
}

describe('insightly transformNote', () => {
  it('maps NOTE_ID to string id', () => {
    expect(transformNote(makeRaw({ NOTE_ID: 3 })).id).toBe('3')
  })

  it('uses BODY as content', () => {
    expect(transformNote(makeRaw({ BODY: 'Note body' })).content).toBe('Note body')
  })

  it('falls back to TITLE when BODY missing', () => {
    expect(transformNote(makeRaw({ TITLE: 'Note title' })).content).toBe('Note title')
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
    const result = transformNote(makeRaw({ NOTE_ID: 3 }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('insightly untransformNote', () => {
  it('sets both TITLE and BODY from content', () => {
    const result = untransformNote({ content: 'My note' })
    expect(result.TITLE).toBe('My note')
    expect(result.BODY).toBe('My note')
  })
})
