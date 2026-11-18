import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawOracleCxNote,
} from '../../../../../../../src/verticals/crm/adapters/oracle-cx/transform/note'

function makeRaw(overrides: Partial<RawOracleCxNote> = {}): RawOracleCxNote {
  return { NoteId: 1, ...overrides }
}

describe('oracle-cx transformNote', () => {
  it('maps NoteId to id string', () => {
    expect(transformNote(makeRaw({ NoteId: 5 })).id).toBe('5')
  })

  it('uses NoteTxt as content', () => {
    expect(transformNote(makeRaw({ NoteTxt: 'Text content' })).content).toBe('Text content')
  })

  it('falls back to NoteTitle when NoteTxt absent', () => {
    expect(transformNote(makeRaw({ NoteTitle: 'Title only' })).content).toBe('Title only')
  })

  it('maps contact_id from PartyId', () => {
    const result = transformNote(makeRaw({ PartyId: 20 }))
    expect(result.contact_id).toBe('20')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ NoteId: 5 }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('oracle-cx untransformNote', () => {
  it('maps content to NoteTxt and NoteTitle', () => {
    const result = untransformNote({ content: 'Hello' })
    expect(result.NoteTxt).toBe('Hello')
    expect(result.NoteTitle).toBe('Hello')
  })
})
