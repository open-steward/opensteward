import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawCloseNote } from '../../../../../../../src/verticals/crm/adapters/close/transform/note'

function makeRaw(overrides: Partial<RawCloseNote> = {}): RawCloseNote {
  return { id: 'n1', note: 'A note', ...overrides }
}

describe('close transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('n1')
  })

  it('maps content from note', () => {
    expect(transformNote(makeRaw()).content).toBe('A note')
  })

  it('maps contact_id, company_id, deal_id', () => {
    const result = transformNote(makeRaw({ contact_id: 'c1', lead_id: 'l1', opportunity_id: 'd1' }))
    expect(result.contact_id).toBe('c1')
    expect(result.company_id).toBe('l1')
    expect(result.deal_id).toBe('d1')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransformNote maps content to note', () => {
    expect(untransformNote({ content: 'hello' }).note).toBe('hello')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
