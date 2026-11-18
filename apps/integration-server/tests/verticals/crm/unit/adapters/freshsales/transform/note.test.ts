import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawFreshsalesNote,
} from '../../../../../../../src/verticals/crm/adapters/freshsales/transform/note'

function makeRaw(overrides: Partial<RawFreshsalesNote> = {}): RawFreshsalesNote {
  return { id: 2, ...overrides }
}

describe('freshsales transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 2 })).id).toBe('2')
  })

  it('maps description to content', () => {
    expect(transformNote(makeRaw({ description: 'A note' })).content).toBe('A note')
  })

  it('defaults content to empty string', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps contact_id when targetable_type is Contact', () => {
    const result = transformNote(makeRaw({ targetable_type: 'Contact', targetable_id: 5 }))
    expect(result.contact_id).toBe('5')
  })

  it('maps deal_id when targetable_type is Deal', () => {
    const result = transformNote(makeRaw({ targetable_type: 'Deal', targetable_id: 6 }))
    expect(result.deal_id).toBe('6')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: 2 }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('freshsales untransformNote', () => {
  it('maps content to description', () => {
    const result = untransformNote({ content: 'Note text' })
    expect(result.description).toBe('Note text')
  })
})
