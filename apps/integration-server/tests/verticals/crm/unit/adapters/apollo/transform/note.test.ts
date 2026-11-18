import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawApolloNote } from '../../../../../../../src/verticals/crm/adapters/apollo/transform/note'

function makeRaw(overrides: Partial<RawApolloNote> = {}): RawApolloNote {
  return { id: 'n1', content: 'A note', ...overrides }
}

describe('apollo transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('n1')
  })

  it('maps content', () => {
    expect(transformNote(makeRaw()).content).toBe('A note')
  })

  it('maps contact_id and company_id', () => {
    const result = transformNote(makeRaw({ contact_id: 'c1', account_id: 'a1' }))
    expect(result.contact_id).toBe('c1')
    expect(result.company_id).toBe('a1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransformNote maps account_id from company_id', () => {
    const result = untransformNote({ company_id: 'a1' })
    expect(result.account_id).toBe('a1')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
