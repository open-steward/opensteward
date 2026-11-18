import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote } from '../../../../../../../src/verticals/crm/adapters/teamleader/transform/note'
import type { RawTeamleaderNote } from '../../../../../../../src/verticals/crm/adapters/teamleader/transform/note'

function makeRaw(overrides: Partial<RawTeamleaderNote> = {}): RawTeamleaderNote {
  return { id: 'n1', ...overrides }
}

describe('teamleader transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('n1')
  })
  it('maps content from detail', () => {
    expect(transformNote(makeRaw({ detail: 'Note content' })).content).toBe('Note content')
  })
  it('falls back to title for content', () => {
    expect(transformNote(makeRaw({ title: 'Title note' })).content).toBe('Title note')
  })
  it('maps contact_id when customer type is contact', () => {
    expect(transformNote(makeRaw({ customer: { type: 'contact', id: 'c1' } })).contact_id).toBe('c1')
  })
  it('maps company_id when customer type is company', () => {
    expect(transformNote(makeRaw({ customer: { type: 'company', id: 'co1' } })).company_id).toBe('co1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'Test', contact_id: 'c1' })
    expect(result.detail).toBe('Test')
    expect(result.customer).toEqual({ type: 'contact', id: 'c1' })
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
