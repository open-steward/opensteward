import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawLacrmNote,
} from '../../../../../../../src/verticals/crm/adapters/lacrm/transform/note'

function makeRaw(overrides: Partial<RawLacrmNote> = {}): RawLacrmNote {
  return { NoteId: 'n-1', ...overrides }
}

describe('lacrm transformNote', () => {
  it('maps NoteId to id', () => {
    expect(transformNote(makeRaw({ NoteId: 'n-1' })).id).toBe('n-1')
  })

  it('maps Note to content', () => {
    expect(transformNote(makeRaw({ Note: 'Note text' })).content).toBe('Note text')
  })

  it('defaults content to empty string', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps ContactId to contact_id', () => {
    expect(transformNote(makeRaw({ ContactId: 'c-2' })).contact_id).toBe('c-2')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ NoteId: 'n-1' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('lacrm untransformNote', () => {
  it('maps content to Note', () => {
    const result = untransformNote({ content: 'My note' })
    expect(result.Note).toBe('My note')
  })
})
