import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawZohoNote } from '../../../../../../../src/verticals/crm/adapters/zoho-crm/transform/note'

function makeRaw(overrides: Partial<RawZohoNote> = {}): RawZohoNote {
  return { id: 'ZONOTE1', ...overrides }
}

describe('zoho-crm transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw()).id).toBe('ZONOTE1')
  })

  it('uses Note_Content as content', () => {
    expect(transformNote(makeRaw({ Note_Content: 'A note' })).content).toBe('A note')
  })

  it('falls back to Note_Title when Note_Content is absent', () => {
    expect(transformNote(makeRaw({ Note_Title: 'Title Only' })).content).toBe('Title Only')
  })

  it('sets contact_id when se_module is Contacts', () => {
    const result = transformNote(makeRaw({ se_module: 'Contacts', Parent_Id: { id: 'C1' } }))
    expect(result.contact_id).toBe('C1')
    expect(result.deal_id).toBeUndefined()
  })

  it('sets deal_id when se_module is Deals', () => {
    const result = transformNote(makeRaw({ se_module: 'Deals', Parent_Id: { id: 'D1' } }))
    expect(result.deal_id).toBe('D1')
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

describe('zoho-crm untransformNote', () => {
  it('maps content to Note_Content', () => {
    expect(untransformNote({ content: 'text' }).Note_Content).toBe('text')
  })

  it('maps contact_id to Contacts module', () => {
    const result = untransformNote({ contact_id: 'C1' })
    expect(result.se_module).toBe('Contacts')
    expect((result.Parent_Id as { id: string }).id).toBe('C1')
  })
})
