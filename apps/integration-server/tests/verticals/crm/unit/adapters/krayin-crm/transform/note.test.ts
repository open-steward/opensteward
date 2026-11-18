import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawKrayinNote,
} from '../../../../../../../src/verticals/crm/adapters/krayin-crm/transform/note'

function makeRaw(overrides: Partial<RawKrayinNote> = {}): RawKrayinNote {
  return { ...overrides }
}

describe('krayin-crm transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: '2' })).id).toBe('2')
  })

  it('uses note field as content', () => {
    expect(transformNote(makeRaw({ note: 'A note' })).content).toBe('A note')
  })

  it('falls back to content field', () => {
    expect(transformNote(makeRaw({ content: 'Backup content' })).content).toBe('Backup content')
  })

  it('defaults content to empty string', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps person.id to contact_id', () => {
    expect(transformNote(makeRaw({ person: { id: '5' } })).contact_id).toBe('5')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: '2' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('krayin-crm untransformNote', () => {
  it('maps content to note', () => {
    const result = untransformNote({ content: 'My note' })
    expect(result.note).toBe('My note')
  })
})
