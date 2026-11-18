import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawPipelinerNote,
} from '../../../../../../../src/verticals/crm/adapters/pipeliner/transform/note'

function makeRaw(overrides: Partial<RawPipelinerNote> = {}): RawPipelinerNote {
  return { id: 'note-1', ...overrides }
}

describe('pipeliner transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw({ id: 'note-5' })).id).toBe('note-5')
  })

  it('maps content from note field', () => {
    expect(transformNote(makeRaw({ note: 'Some note' })).content).toBe('Some note')
  })

  it('falls back to title when note absent', () => {
    expect(transformNote(makeRaw({ title: 'A title' })).content).toBe('A title')
  })

  it('maps deal_id from lead_oppty_id', () => {
    expect(transformNote(makeRaw({ lead_oppty_id: 'opp-1' })).deal_id).toBe('opp-1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: 'note-5' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('pipeliner untransformNote', () => {
  it('maps content to note', () => {
    const result = untransformNote({ content: 'A note' })
    expect(result.note).toBe('A note')
  })
})
