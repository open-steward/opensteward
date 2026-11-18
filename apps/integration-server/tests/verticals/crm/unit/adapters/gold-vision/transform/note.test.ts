import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawGoldVisionNote,
} from '../../../../../../../src/verticals/crm/adapters/gold-vision/transform/note'

function makeRaw(overrides: Partial<RawGoldVisionNote> = {}): RawGoldVisionNote {
  return { id: 1, ...overrides }
}

describe('gold-vision transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('returns empty string id when absent', () => {
    expect(transformNote(makeRaw({ id: undefined })).id).toBe('')
  })

  it('maps notes to content', () => {
    expect(transformNote(makeRaw({ notes: 'Some note body' })).content).toBe('Some note body')
  })

  it('returns empty string content when notes absent', () => {
    expect(transformNote(makeRaw({ notes: undefined })).content).toBe('')
  })

  it('maps contactId to contact_id string', () => {
    expect(transformNote(makeRaw({ contactId: 7 })).contact_id).toBe('7')
  })

  it('returns undefined contact_id when absent', () => {
    expect(transformNote(makeRaw({ contactId: undefined })).contact_id).toBeUndefined()
  })

  it('maps accountId to company_id string', () => {
    expect(transformNote(makeRaw({ accountId: 8 })).company_id).toBe('8')
  })

  it('returns undefined company_id when absent', () => {
    expect(transformNote(makeRaw({ accountId: undefined })).company_id).toBeUndefined()
  })

  it('maps opportunityId to deal_id string', () => {
    expect(transformNote(makeRaw({ opportunityId: 9 })).deal_id).toBe('9')
  })

  it('returns undefined deal_id when absent', () => {
    expect(transformNote(makeRaw({ opportunityId: undefined })).deal_id).toBeUndefined()
  })

  it('maps ownerId to owner_id string', () => {
    expect(transformNote(makeRaw({ ownerId: 3 })).owner_id).toBe('3')
  })

  it('returns undefined owner_id when absent', () => {
    expect(transformNote(makeRaw({ ownerId: undefined })).owner_id).toBeUndefined()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields without throwing', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ id: 42 }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('gold-vision untransformNote', () => {
  it('maps content to notes', () => {
    expect(untransformNote({ content: 'Some note body' })).toMatchObject({
      notes: 'Some note body',
    })
  })

  it('maps contact_id to contactId', () => {
    expect(untransformNote({ contact_id: '7' })).toMatchObject({ contactId: '7' })
  })

  it('maps company_id to accountId', () => {
    expect(untransformNote({ company_id: '8' })).toMatchObject({ accountId: '8' })
  })

  it('maps deal_id to opportunityId', () => {
    expect(untransformNote({ deal_id: '9' })).toMatchObject({ opportunityId: '9' })
  })

  it('maps owner_id to ownerId', () => {
    expect(untransformNote({ owner_id: '3' })).toMatchObject({ ownerId: '3' })
  })

  it('omits undefined fields', () => {
    const result = untransformNote({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
