import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawHubSpotNote,
} from '../../../../../../../src/verticals/crm/adapters/hubspot/transform/note'

function makeRaw(overrides: Partial<RawHubSpotNote> = {}): RawHubSpotNote {
  return { id: 'hs-n-1', properties: {}, ...overrides }
}

describe('hubspot transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw({ id: 'hs-n-1' })).id).toBe('hs-n-1')
  })

  it('maps hs_note_body to content', () => {
    const result = transformNote(makeRaw({ properties: { hs_note_body: 'Important note' } }))
    expect(result.content).toBe('Important note')
  })

  it('defaults content to empty string', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps passed contactId', () => {
    expect(transformNote(makeRaw(), { contactId: 'c-1' }).contact_id).toBe('c-1')
  })

  it('maps companyId and dealId, which it previously could not carry at all', () => {
    // `NoteSchema` has advertised `company_id` and `deal_id` all along, and
    // the HubSpot transform had no parameter for either — so both were
    // permanently absent rather than merely often absent. A note reaches a
    // record ONLY through associations, so this was the whole linkage.
    const n = transformNote(makeRaw(), { companyId: 'co-9', dealId: 'd-7' })
    expect(n.company_id).toBe('co-9')
    expect(n.deal_id).toBe('d-7')
  })

  it('leaves links undefined when the note is associated with nothing', () => {
    const n = transformNote(makeRaw())
    expect(n.contact_id).toBeUndefined()
    expect(n.company_id).toBeUndefined()
    expect(n.deal_id).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: 'hs-n-1' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('hubspot untransformNote', () => {
  it('wraps content in properties', () => {
    const result = untransformNote({ content: 'My note' })
    const props = result.properties as Record<string, unknown>
    expect(props.hs_note_body).toBe('My note')
  })
})
