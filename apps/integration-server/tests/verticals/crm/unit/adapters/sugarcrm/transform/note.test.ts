import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawSugarNote } from '../../../../../../../src/verticals/crm/adapters/sugarcrm/transform/note'

function makeRaw(overrides: Partial<RawSugarNote> = {}): RawSugarNote {
  return { id: 'SNOTE1', ...overrides }
}

describe('sugarcrm transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('SNOTE1')
  })

  it('prefers description over name for content', () => {
    expect(transformNote(makeRaw({ description: 'Desc', name: 'Name' })).content).toBe('Desc')
  })

  it('falls back to name when description is absent', () => {
    expect(transformNote(makeRaw({ name: 'Title note' })).content).toBe('Title note')
  })

  it('maps opportunity_id to deal_id', () => {
    expect(transformNote(makeRaw({ opportunity_id: 'OPP1' })).deal_id).toBe('OPP1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('sugarcrm untransformNote', () => {
  it('maps content to both name and description', () => {
    const result = untransformNote({ content: 'Some note' })
    expect(result.description).toBe('Some note')
    expect((result.name as string).length).toBeGreaterThan(0)
  })
})
