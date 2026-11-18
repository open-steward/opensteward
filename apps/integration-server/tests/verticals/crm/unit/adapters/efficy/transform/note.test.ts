import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawEfficyNote } from '../../../../../../../src/verticals/crm/adapters/efficy/transform/note'

function makeRaw(overrides: Partial<RawEfficyNote> = {}): RawEfficyNote {
  return { K_NOTE: 1, ...overrides }
}

describe('efficy transformNote', () => {
  it('maps id from K_NOTE', () => {
    const result = transformNote(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps content from TEXT', () => {
    const result = transformNote(makeRaw({ TEXT: 'Meeting notes' }))
    expect(result.content).toBe('Meeting notes')
  })

  it('defaults content to empty string', () => {
    const result = transformNote(makeRaw())
    expect(result.content).toBe('')
  })

  it('maps contact_id from K_CONTACT', () => {
    const result = transformNote(makeRaw({ K_CONTACT: 5 }))
    expect(result.contact_id).toBe('5')
  })

  it('maps company_id from K_COMPANY', () => {
    const result = transformNote(makeRaw({ K_COMPANY: 8 }))
    expect(result.company_id).toBe('8')
  })

  it('maps deal_id from K_OPPORTUNITY', () => {
    const result = transformNote(makeRaw({ K_OPPORTUNITY: 3 }))
    expect(result.deal_id).toBe('3')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformNote({ content: 'Test note' })
    expect(result).toBeDefined()
    expect(result.TEXT).toBe('Test note')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
