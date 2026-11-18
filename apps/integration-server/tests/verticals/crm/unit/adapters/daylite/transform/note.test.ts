import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawDayliteNote,
} from '../../../../../../../src/verticals/crm/adapters/daylite/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawDayliteNote> = {}): RawDayliteNote {
  return { self: '/v1/notes/1', details: 'A note body', ...overrides }
}

describe('daylite transformNote', () => {
  it('extracts id from self URL', () => {
    expect(transformNote(makeRaw({ self: '/v1/notes/200' })).id).toBe('200')
  })

  it('maps details to content', () => {
    expect(transformNote(makeRaw({ details: 'Meeting summary' })).content).toBe('Meeting summary')
  })

  it('falls back to title when details absent', () => {
    const result = transformNote(makeRaw({ details: undefined, title: 'Heading only' }))
    expect(result.content).toBe('Heading only')
  })

  it('defaults content to empty string when both absent', () => {
    const result = transformNote(makeRaw({ details: undefined, title: undefined }))
    expect(result.content).toBe('')
  })

  it('extracts contact_id from first contacts URL', () => {
    const result = transformNote(makeRaw({ contacts: ['/v1/contacts/10'] }))
    expect(result.contact_id).toBe('10')
  })

  it('extracts company_id from first companies URL', () => {
    const result = transformNote(makeRaw({ companies: ['/v1/companies/20'] }))
    expect(result.company_id).toBe('20')
  })

  it('extracts deal_id from first opportunities URL', () => {
    const result = transformNote(makeRaw({ opportunities: ['/v1/opportunities/30'] }))
    expect(result.deal_id).toBe('30')
  })

  it('extracts owner_id from owner URL', () => {
    const result = transformNote(makeRaw({ owner: '/v1/users/7' }))
    expect(result.owner_id).toBe('7')
  })

  it('passes create_date as created_at', () => {
    const result = transformNote(makeRaw({ create_date: '2026-01-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces a NoteSchema-valid result', () => {
    const raw = makeRaw({
      details: 'Meeting summary',
      create_date: '2026-01-01T00:00:00.000Z',
    })
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('daylite untransformNote', () => {
  it('maps content → details', () => {
    const out = untransformNote({ content: 'Meeting summary' })
    expect(out.details).toBe('Meeting summary')
  })

  it('maps owner_id → owner URL', () => {
    const out = untransformNote({ content: 'x', owner_id: '7' })
    expect(out.owner).toBe('/v1/users/7')
  })

  it('maps contact_id → contacts URL array', () => {
    const out = untransformNote({ content: 'x', contact_id: '10' })
    expect(out.contacts).toEqual(['/v1/contacts/10'])
  })

  it('maps company_id → companies URL array', () => {
    const out = untransformNote({ content: 'x', company_id: '20' })
    expect(out.companies).toEqual(['/v1/companies/20'])
  })

  it('maps deal_id → opportunities URL array', () => {
    const out = untransformNote({ content: 'x', deal_id: '30' })
    expect(out.opportunities).toEqual(['/v1/opportunities/30'])
  })

  it('round-trips content and contact_id', () => {
    const raw = makeRaw({
      details: 'Round-trip content',
      contacts: ['/v1/contacts/10'],
    })
    const note = transformNote(raw)
    const back = untransformNote(note)
    expect(back.details).toBe('Round-trip content')
    expect(back.contacts).toEqual(['/v1/contacts/10'])
  })
})
