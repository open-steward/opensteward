import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawKommoNote,
} from '../../../../../../../src/verticals/crm/adapters/kommo/transform/note'

function makeRaw(overrides: Partial<RawKommoNote> = {}): RawKommoNote {
  return { id: 1, ...overrides }
}

describe('kommo transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 6 })).id).toBe('6')
  })

  it('extracts content from params.text', () => {
    const result = transformNote(makeRaw({ params: { text: 'Note content' } }))
    expect(result.content).toBe('Note content')
  })

  it('defaults content to empty string', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps contact_id when entity_type is contacts', () => {
    const result = transformNote(makeRaw({ entity_type: 'contacts', entity_id: 5 }))
    expect(result.contact_id).toBe('5')
  })

  it('maps deal_id when entity_type is leads', () => {
    const result = transformNote(makeRaw({ entity_type: 'leads', entity_id: 6 }))
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
    const result = transformNote(makeRaw({ id: 6 }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('kommo untransformNote', () => {
  it('sets note_type to common and wraps content', () => {
    const result = untransformNote({ content: 'Test' })
    expect(result.note_type).toBe('common')
    expect((result.params as { text: string }).text).toBe('Test')
  })
})
