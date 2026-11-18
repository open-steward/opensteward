import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote } from '../../../../../../../src/verticals/crm/adapters/suitecrm/transform/note'
import type { RawSuiteCrmNote } from '../../../../../../../src/verticals/crm/adapters/suitecrm/transform/note'

function makeRaw(overrides: Partial<RawSuiteCrmNote> = {}): RawSuiteCrmNote {
  return { id: 'n1', ...overrides }
}

describe('suitecrm transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('n1')
  })
  it('maps content from description', () => {
    expect(transformNote(makeRaw({ description: 'My note' })).content).toBe('My note')
  })
  it('maps contact_id', () => {
    expect(transformNote(makeRaw({ contact_id: 'c1' })).contact_id).toBe('c1')
  })
  it('maps deal_id from parent_id when parent_type is Opportunities', () => {
    const result = transformNote(makeRaw({ parent_type: 'Opportunities', parent_id: 'opp1' }))
    expect(result.deal_id).toBe('opp1')
  })
  it('does not map deal_id when parent_type is not Opportunities', () => {
    const result = transformNote(makeRaw({ parent_type: 'Accounts', parent_id: 'acc1' }))
    expect(result.deal_id).toBeUndefined()
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'Test' })
    expect(result.description).toBe('Test')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
