import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawZendeskSellNote } from '../../../../../../../src/verticals/crm/adapters/zendesk-sell/transform/note'

function makeRaw(overrides: Partial<RawZendeskSellNote> = {}): RawZendeskSellNote {
  return { id: 7, content: 'ZD note', ...overrides }
}

describe('zendesk-sell transformNote', () => {
  it('maps id and content', () => {
    const result = transformNote(makeRaw())
    expect(result.id).toBe('7')
    expect(result.content).toBe('ZD note')
  })

  it('sets contact_id when resource_type is contact', () => {
    const result = transformNote(makeRaw({ resource_type: 'contact', resource_id: 5 }))
    expect(result.contact_id).toBe('5')
    expect(result.deal_id).toBeUndefined()
  })

  it('sets deal_id when resource_type is deal', () => {
    const result = transformNote(makeRaw({ resource_type: 'deal', resource_id: 8 }))
    expect(result.deal_id).toBe('8')
    expect(result.contact_id).toBeUndefined()
  })

  it('maps creator_id to owner_id', () => {
    expect(transformNote(makeRaw({ creator_id: 3 })).owner_id).toBe('3')
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

describe('zendesk-sell untransformNote', () => {
  it('maps deal_id to deal resource', () => {
    const result = untransformNote({ deal_id: '20' })
    expect(result.resource_type).toBe('deal')
    expect(result.resource_id).toBe(20)
  })
})
