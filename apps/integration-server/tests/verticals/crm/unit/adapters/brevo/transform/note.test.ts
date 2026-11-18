import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import { transformNote, untransformNote, type RawBrevoNote } from '../../../../../../../src/verticals/crm/adapters/brevo/transform/note'

// Fixture shaped from the vendor spec's Note schema: links are the plural
// `contactIds` / `companyIds` / `dealIds` arrays, and `authorId` is the
// author's user object ({id, email, name.fullName}), not a bare id.
function makeRaw(overrides: Partial<RawBrevoNote> = {}): RawBrevoNote {
  return {
    id: 'note_1',
    text: 'Follow up on Q1 expansion',
    contactIds: [12],
    companyIds: ['61f4b45d90124f66d70c33d0'],
    dealIds: ['63102c2fdfd15f658862dc76'],
    authorId: {
      id: '6329d10b0b78ba3212e8bb26',
      email: 'olivia@acme.example',
      name: { fullName: 'Olivia Owner' },
    },
    createdAt: '2026-01-15T09:30:00.000+01:00',
    updatedAt: '2026-02-01T14:20:00.000+01:00',
    ...overrides,
  }
}

describe('brevo transformNote', () => {
  it('maps id', () => {
    const result = transformNote(makeRaw())
    expect(result.id).toBe('note_1')
  })

  it('maps content from text', () => {
    const result = transformNote(makeRaw({ text: 'Meeting notes' }))
    expect(result.content).toBe('Meeting notes')
  })

  it('defaults content to empty string', () => {
    const result = transformNote({ id: '1' })
    expect(result.content).toBe('')
  })

  it('maps contact_id from the first element of contactIds, stringified', () => {
    const result = transformNote(makeRaw({ contactIds: [12, 99] }))
    expect(result.contact_id).toBe('12')
  })

  it('maps company_id from the first element of companyIds', () => {
    const result = transformNote(makeRaw())
    expect(result.company_id).toBe('61f4b45d90124f66d70c33d0')
  })

  it('maps deal_id from the first element of dealIds', () => {
    const result = transformNote(makeRaw())
    expect(result.deal_id).toBe('63102c2fdfd15f658862dc76')
  })

  it('maps owner_id from authorId.id — authorId is an object, not a bare id', () => {
    const result = transformNote(makeRaw())
    expect(result.owner_id).toBe('6329d10b0b78ba3212e8bb26')
  })

  it('does not read the old singular contactId/companyId/dealId fields', () => {
    const result = transformNote({
      id: '1',
      contactId: 'wrong',
      companyId: 'wrong',
      dealId: 'wrong',
    } as unknown as RawBrevoNote)
    expect(result.contact_id).toBeUndefined()
    expect(result.company_id).toBeUndefined()
    expect(result.deal_id).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote({ id: '1' })).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('untransforms back to the platform shape', () => {
    const result = untransformNote({ content: 'Test note', contact_id: '12', company_id: 'co_1', deal_id: 'deal_1' })
    expect(result.text).toBe('Test note')
    expect(result.contactIds).toEqual([12])
    expect(result.companyIds).toEqual(['co_1'])
    expect(result.dealIds).toEqual(['deal_1'])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw())
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})
