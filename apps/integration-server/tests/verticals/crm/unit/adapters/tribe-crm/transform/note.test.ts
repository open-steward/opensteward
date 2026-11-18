import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawTribeCrmNote,
} from '../../../../../../../src/verticals/crm/adapters/tribe-crm/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawTribeCrmNote> = {}): RawTribeCrmNote {
  return { Id: 1, ...overrides }
}

describe('tribe-crm transformNote', () => {
  it('maps Id to string id', () => {
    expect(transformNote(makeRaw({ Id: 55 })).id).toBe('55')
  })

  it('uses Description as primary content source', () => {
    const result = transformNote(makeRaw({ Description: 'Note body', Subject: 'Title' }))
    expect(result.content).toBe('Note body')
  })

  it('falls back to Subject when Description absent', () => {
    const result = transformNote(makeRaw({ Subject: 'Fallback title' }))
    expect(result.content).toBe('Fallback title')
  })

  it('defaults content to empty string when both absent', () => {
    const result = transformNote(makeRaw())
    expect(result.content).toBe('')
  })

  it('maps RelationId to contact_id', () => {
    const result = transformNote(makeRaw({ RelationId: 11 }))
    expect(result.contact_id).toBe('11')
  })

  it('maps OrganisationId to company_id', () => {
    const result = transformNote(makeRaw({ OrganisationId: 22 }))
    expect(result.company_id).toBe('22')
  })

  it('maps ActivityId to deal_id', () => {
    const result = transformNote(makeRaw({ ActivityId: 33 }))
    expect(result.deal_id).toBe('33')
  })

  it('maps OwnerId to owner_id', () => {
    const result = transformNote(makeRaw({ OwnerId: 5 }))
    expect(result.owner_id).toBe('5')
  })

  it('maps CreatedOn to created_at', () => {
    const result = transformNote(makeRaw({ CreatedOn: '2026-01-15T09:30:00.000Z' }))
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('passes NoteSchema validation', () => {
    const raw = makeRaw({
      Id: 55,
      Description: 'Note body',
      Subject: 'Title',
      RelationId: 11,
      OrganisationId: 22,
      ActivityId: 33,
      OwnerId: 5,
      CreatedOn: '2026-01-15T09:30:00.000Z',
      ModifiedOn: '2026-02-01T14:20:00.000Z',
    })
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('tribe-crm untransformNote', () => {
  it('maps content back to Description', () => {
    const result = untransformNote({ content: 'Note body' })
    expect(result.Description).toBe('Note body')
  })

  it('maps contact_id back to RelationId', () => {
    const result = untransformNote({ contact_id: '11' })
    expect(result.RelationId).toBe('11')
  })

  it('maps company_id back to OrganisationId', () => {
    const result = untransformNote({ company_id: '22' })
    expect(result.OrganisationId).toBe('22')
  })

  it('maps deal_id back to ActivityId', () => {
    const result = untransformNote({ deal_id: '33' })
    expect(result.ActivityId).toBe('33')
  })

  it('maps owner_id back to OwnerId', () => {
    const result = untransformNote({ owner_id: '5' })
    expect(result.OwnerId).toBe('5')
  })

  it('omits undefined fields', () => {
    const result = untransformNote({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
