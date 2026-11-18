import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawGrooveTicket,
} from '../../../../../../../src/verticals/crm/adapters/groove-sales/transform/note'

function makeRaw(overrides: Partial<RawGrooveTicket> = {}): RawGrooveTicket {
  return { id: 1, ...overrides }
}

describe('groove-sales transformNote', () => {
  it('maps numeric id to string', () => {
    expect(transformNote(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps string id to string', () => {
    expect(transformNote(makeRaw({ id: '42' })).id).toBe('42')
  })

  it('maps body to content when present', () => {
    expect(transformNote(makeRaw({ body: 'Note text' })).content).toBe('Note text')
  })

  it('falls back to title when body is absent', () => {
    expect(transformNote(makeRaw({ title: 'Subject line' })).content).toBe('Subject line')
  })

  it('falls back to title when body is null', () => {
    expect(transformNote(makeRaw({ body: null, title: 'Subject line' })).content).toBe(
      'Subject line',
    )
  })

  it('returns empty string when both body and title are absent', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('returns empty string when both body and title are null', () => {
    expect(transformNote(makeRaw({ body: null, title: null })).content).toBe('')
  })

  it('maps numeric person_id to contact_id string', () => {
    expect(transformNote(makeRaw({ person_id: 55 })).contact_id).toBe('55')
  })

  it('maps string person_id to contact_id string', () => {
    expect(transformNote(makeRaw({ person_id: '55' })).contact_id).toBe('55')
  })

  it('returns undefined for contact_id when person_id is null', () => {
    expect(transformNote(makeRaw({ person_id: null })).contact_id).toBeUndefined()
  })

  it('returns undefined for contact_id when person_id is absent', () => {
    expect(transformNote(makeRaw()).contact_id).toBeUndefined()
  })

  it('maps numeric author_id to owner_id string', () => {
    expect(transformNote(makeRaw({ author_id: 99 })).owner_id).toBe('99')
  })

  it('maps string author_id to owner_id string', () => {
    expect(transformNote(makeRaw({ author_id: '99' })).owner_id).toBe('99')
  })

  it('returns undefined for owner_id when author_id is null', () => {
    expect(transformNote(makeRaw({ author_id: null })).owner_id).toBeUndefined()
  })

  it('returns undefined for owner_id when author_id is absent', () => {
    expect(transformNote(makeRaw()).owner_id).toBeUndefined()
  })

  it('maps created_at when present', () => {
    const result = transformNote(makeRaw({ created_at: '2024-01-15T10:00:00Z' }))
    expect(result.created_at).toBeDefined()
  })

  it('returns undefined for created_at when absent', () => {
    expect(transformNote(makeRaw()).created_at).toBeUndefined()
  })

  it('maps updated_at when present', () => {
    const result = transformNote(makeRaw({ updated_at: '2024-06-01T12:00:00Z' }))
    expect(result.updated_at).toBeDefined()
  })

  it('returns undefined for updated_at when absent', () => {
    expect(transformNote(makeRaw()).updated_at).toBeUndefined()
  })

  it('always returns undefined for company_id', () => {
    expect(transformNote(makeRaw()).company_id).toBeUndefined()
  })

  it('always returns undefined for deal_id', () => {
    expect(transformNote(makeRaw()).deal_id).toBeUndefined()
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

describe('groove-sales untransformNote', () => {
  it('maps content to body', () => {
    expect(untransformNote({ content: 'Hello world' })).toMatchObject({ body: 'Hello world' })
  })

  it('maps contact_id to person_id', () => {
    expect(untransformNote({ contact_id: '42' })).toMatchObject({ person_id: '42' })
  })

  it('does not include owner_id in output', () => {
    const result = untransformNote({ owner_id: '7' })
    expect(result).not.toHaveProperty('owner_id')
  })

  it('does not include company_id in output', () => {
    const result = untransformNote({ company_id: '5' })
    expect(result).not.toHaveProperty('company_id')
  })

  it('does not include deal_id in output', () => {
    const result = untransformNote({ deal_id: '3' })
    expect(result).not.toHaveProperty('deal_id')
  })
})
