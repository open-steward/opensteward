import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawSalesloftNote } from '../../../../../../../src/verticals/crm/adapters/salesloft/transform/note'

function makeRaw(overrides: Partial<RawSalesloftNote> = {}): RawSalesloftNote {
  return { id: 5, ...overrides }
}

describe('salesloft transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw()).id).toBe('5')
  })

  it('sets contact_id when associated_type is Person', () => {
    const result = transformNote(makeRaw({ associated_type: 'Person', associated_to: { id: 20 } }))
    expect(result.contact_id).toBe('20')
    expect(result.deal_id).toBeUndefined()
  })

  it('sets deal_id when associated_type is Opportunity', () => {
    const result = transformNote(makeRaw({ associated_type: 'Opportunity', associated_to: { id: 30 } }))
    expect(result.deal_id).toBe('30')
    expect(result.contact_id).toBeUndefined()
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

describe('salesloft untransformNote', () => {
  it('maps contact_id to Person association', () => {
    const result = untransformNote({ contact_id: '20' })
    expect(result.associated_type).toBe('Person')
    expect((result.associated_to as { id: number }).id).toBe(20)
  })
})
