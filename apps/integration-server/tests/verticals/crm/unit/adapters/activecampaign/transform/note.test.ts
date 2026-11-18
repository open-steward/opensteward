import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawActiveCampaignNote } from '../../../../../../../src/verticals/crm/adapters/activecampaign/transform/note'

function makeRaw(overrides: Partial<RawActiveCampaignNote> = {}): RawActiveCampaignNote {
  return { id: '1', note: 'A note', ...overrides }
}

describe('activecampaign transformNote', () => {
  it('maps id', () => {
    expect(transformNote(makeRaw()).id).toBe('1')
  })

  it('maps content from note field', () => {
    expect(transformNote(makeRaw()).content).toBe('A note')
  })

  it('maps contact_id when reltype is Subscriber', () => {
    const result = transformNote(makeRaw({ reltype: 'Subscriber', relid: '42' }))
    expect(result.contact_id).toBe('42')
    expect(result.deal_id).toBeUndefined()
  })

  it('maps deal_id when reltype is Deal', () => {
    const result = transformNote(makeRaw({ reltype: 'Deal', relid: '99' }))
    expect(result.deal_id).toBe('99')
    expect(result.contact_id).toBeUndefined()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransformNote sets reltype for contact', () => {
    const result = untransformNote({ content: 'hi', contact_id: '5' })
    expect(result.reltype).toBe('Subscriber')
    expect(result.relid).toBe('5')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
