import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawSalesflareNote,
} from '../../../../../../../src/verticals/crm/adapters/salesflare/transform/note'

function makeRaw(overrides: Partial<RawSalesflareNote> = {}): RawSalesflareNote {
  return { id: 1, ...overrides }
}

describe('salesflare transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps content from note', () => {
    expect(transformNote(makeRaw({ note: 'A note' })).content).toBe('A note')
  })

  it('maps company_id from account.id', () => {
    expect(transformNote(makeRaw({ account: { id: 3 } })).company_id).toBe('3')
  })

  it('maps deal_id from opportunity.id', () => {
    expect(transformNote(makeRaw({ opportunity: { id: 7 } })).deal_id).toBe('7')
  })

  it('maps owner_id from created_by.id', () => {
    expect(transformNote(makeRaw({ created_by: { id: 10 } })).owner_id).toBe('10')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: 5 }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('salesflare untransformNote', () => {
  it('maps content to note', () => {
    const result = untransformNote({ content: 'A note' })
    expect(result.note).toBe('A note')
  })
})
