import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawTeamgateNote,
} from '../../../../../../../src/verticals/crm/adapters/teamgate/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawTeamgateNote> = {}): RawTeamgateNote {
  return { id: 1, ...overrides }
}

describe('teamgate transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 55 })).id).toBe('55')
  })

  it('uses content as primary content source', () => {
    const result = transformNote(makeRaw({ content: 'Primary', body: 'Fallback' }))
    expect(result.content).toBe('Primary')
  })

  it('falls back to body when content absent', () => {
    const result = transformNote(makeRaw({ body: 'Body text' }))
    expect(result.content).toBe('Body text')
  })

  it('falls back to text when content and body absent', () => {
    const result = transformNote(makeRaw({ text: 'Text content' }))
    expect(result.content).toBe('Text content')
  })

  it('defaults content to empty string when no text fields present', () => {
    const result = transformNote(makeRaw())
    expect(result.content).toBe('')
  })

  it('maps contactId to contact_id', () => {
    const result = transformNote(makeRaw({ contactId: 11 }))
    expect(result.contact_id).toBe('11')
  })

  it('maps dealId to deal_id', () => {
    const result = transformNote(makeRaw({ dealId: 20 }))
    expect(result.deal_id).toBe('20')
  })

  it('maps ownerId to owner_id', () => {
    const result = transformNote(makeRaw({ ownerId: 3 }))
    expect(result.owner_id).toBe('3')
  })

  it('normalises createdTime to ISO datetime', () => {
    const result = transformNote(makeRaw({ createdTime: '2026-01-15T09:30:00.000Z' }))
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
      id: 55,
      content: 'This is a note.',
      contactId: 11,
      dealId: 20,
      ownerId: 3,
      createdTime: '2026-01-15T09:30:00.000Z',
      updatedTime: '2026-02-01T14:20:00.000Z',
    })
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('teamgate untransformNote', () => {
  it('maps content back to content', () => {
    const result = untransformNote({ content: 'My note' })
    expect(result.content).toBe('My note')
  })

  it('maps contact_id back to contactId', () => {
    const result = untransformNote({ contact_id: '11' })
    expect(result.contactId).toBe('11')
  })

  it('maps deal_id back to dealId', () => {
    const result = untransformNote({ deal_id: '20' })
    expect(result.dealId).toBe('20')
  })

  it('omits undefined fields', () => {
    const result = untransformNote({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
