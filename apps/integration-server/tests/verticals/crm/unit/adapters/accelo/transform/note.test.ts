import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawAcceloNote,
} from '../../../../../../../src/verticals/crm/adapters/accelo/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawAcceloNote> = {}): RawAcceloNote {
  return { id: 'note-1', ...overrides }
}

describe('accelo transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 99 })).id).toBe('99')
  })

  it('maps body to content', () => {
    expect(transformNote(makeRaw({ body: 'A note body' })).content).toBe('A note body')
  })

  it('produces empty string content when body is absent', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps owner_id to string', () => {
    expect(transformNote(makeRaw({ owner_id: 7 })).owner_id).toBe('7')
  })

  it('resolves against_type=contact to contact_id', () => {
    const result = transformNote(makeRaw({ against_type: 'contact', against_id: '55' }))
    expect(result.contact_id).toBe('55')
    expect(result.company_id).toBeUndefined()
  })

  it('resolves against_type=company to company_id', () => {
    const result = transformNote(makeRaw({ against_type: 'company', against_id: '66' }))
    expect(result.company_id).toBe('66')
  })

  it('resolves against_type=affiliation to company_id', () => {
    const result = transformNote(makeRaw({ against_type: 'affiliation', against_id: '77' }))
    expect(result.company_id).toBe('77')
  })

  it('resolves against_type=prospect to deal_id', () => {
    const result = transformNote(makeRaw({ against_type: 'prospect', against_id: '88' }))
    expect(result.deal_id).toBe('88')
  })

  it('converts unix timestamp date_created to ISO', () => {
    const result = transformNote(makeRaw({ date_created: 1737000000 }))
    expect(result.created_at).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('passes NoteSchema.parse without throwing', () => {
    const raw = makeRaw({
      id: '10',
      body: 'Note body text',
      owner_id: '5',
      against_type: 'contact',
      against_id: '77',
      date_created: 1737000000,
      date_modified: 1737086400,
    })
    expect(() => NoteSchema.parse(transformNote(raw))).not.toThrow()
  })
})

describe('accelo untransformNote', () => {
  it('maps content back to body', () => {
    expect(untransformNote({ content: 'A note body' }).body).toBe('A note body')
  })

  it('maps owner_id back', () => {
    expect(untransformNote({ owner_id: '7' }).owner_id).toBe('7')
  })

  it('always sets medium to "Note"', () => {
    expect(untransformNote({}).medium).toBe('Note')
    expect(untransformNote({ content: 'x' }).medium).toBe('Note')
  })

  it('maps contact_id to against_type=contact', () => {
    const result = untransformNote({ contact_id: 'c-1' })
    expect(result.against_type).toBe('contact')
    expect(result.against_id).toBe('c-1')
  })

  it('maps company_id to against_type=company', () => {
    const result = untransformNote({ company_id: 'co-2' })
    expect(result.against_type).toBe('company')
    expect(result.against_id).toBe('co-2')
  })

  it('maps deal_id to against_type=prospect', () => {
    const result = untransformNote({ deal_id: 'd-3' })
    expect(result.against_type).toBe('prospect')
    expect(result.against_id).toBe('d-3')
  })

  it('round-trips content and contact_id', () => {
    const raw = makeRaw({ body: 'Round-trip body', against_type: 'contact', against_id: 'c-5' })
    const canonical = transformNote(raw)
    const back = untransformNote(canonical)
    expect(back.body).toBe('Round-trip body')
    expect(back.against_type).toBe('contact')
    expect(back.against_id).toBe('c-5')
  })
})
