import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawRecruitCrmNote,
} from '../../../../../../../src/verticals/crm/adapters/recruit-crm/transform/note'

function makeRaw(overrides: Partial<RawRecruitCrmNote> = {}): RawRecruitCrmNote {
  return { id: '1', ...overrides }
}

describe('recruit-crm transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: '5' })).id).toBe('5')
  })

  it('maps content from content field', () => {
    expect(transformNote(makeRaw({ content: 'A note' })).content).toBe('A note')
  })

  it('falls back to note field when content absent', () => {
    expect(transformNote(makeRaw({ note: 'Fallback note' })).content).toBe('Fallback note')
  })

  it('maps owner_id from owner object', () => {
    const result = transformNote(makeRaw({ owner: { id: '8' } }))
    expect(result.owner_id).toBe('8')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: '5' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('recruit-crm untransformNote', () => {
  it('maps content', () => {
    const result = untransformNote({ content: 'A note' })
    expect(result.content).toBe('A note')
  })
})
