import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawRexNote,
} from '../../../../../../../src/verticals/crm/adapters/rex-crm/transform/note'

function makeRaw(overrides: Partial<RawRexNote> = {}): RawRexNote {
  return { id: 1, ...overrides }
}

describe('rex-crm transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 3 })).id).toBe('3')
  })

  it('maps content from note', () => {
    expect(transformNote(makeRaw({ note: 'Inspector notes' })).content).toBe('Inspector notes')
  })

  it('maps deal_id from listing_id', () => {
    expect(transformNote(makeRaw({ listing_id: 10 })).deal_id).toBe('10')
  })

  it('maps owner_id from user_id', () => {
    expect(transformNote(makeRaw({ user_id: 4 })).owner_id).toBe('4')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: 3 }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('rex-crm untransformNote', () => {
  it('maps content to note', () => {
    const result = untransformNote({ content: 'A note' })
    expect(result.note).toBe('A note')
  })
})
