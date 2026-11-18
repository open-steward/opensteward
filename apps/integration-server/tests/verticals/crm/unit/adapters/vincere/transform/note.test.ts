import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawVincereNote,
} from '../../../../../../../src/verticals/crm/adapters/vincere/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawVincereNote> = {}): RawVincereNote {
  return {
    id: 55,
    content: 'Follow up on Q1 expansion',
    candidate_id: 101,
    company_id: 202,
    job_id: 303,
    owner_id: 404,
    reg_date: '2026-01-15T09:30:00.000Z',
    updated_date: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('vincere transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw()).id).toBe('55')
  })

  it('maps content', () => {
    expect(transformNote(makeRaw()).content).toBe('Follow up on Q1 expansion')
  })

  it('falls back to text field when content is null', () => {
    const raw = makeRaw({ content: null, text: 'Alternative text' })
    expect(transformNote(raw).content).toBe('Alternative text')
  })

  it('maps candidate_id to contact_id as string', () => {
    expect(transformNote(makeRaw()).contact_id).toBe('101')
  })

  it('maps company_id to string', () => {
    expect(transformNote(makeRaw()).company_id).toBe('202')
  })

  it('maps job_id to deal_id as string', () => {
    expect(transformNote(makeRaw()).deal_id).toBe('303')
  })

  it('maps owner_id to string', () => {
    expect(transformNote(makeRaw()).owner_id).toBe('404')
  })

  it('passes reg_date through toIsoDatetime for created_at', () => {
    expect(transformNote(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('passes updated_date through toIsoDatetime for updated_at', () => {
    expect(transformNote(makeRaw()).updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw as metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => NoteSchema.parse(transformNote(makeRaw()))).not.toThrow()
  })

  it('contact_id is undefined when candidate_id is null', () => {
    expect(transformNote(makeRaw({ candidate_id: null })).contact_id).toBeUndefined()
  })

  it('content is empty string when both content and text are null', () => {
    const raw = makeRaw({ content: null, text: null })
    expect(transformNote(raw).content).toBe('')
  })
})

describe('vincere untransformNote', () => {
  it('maps content', () => {
    const body = untransformNote({ content: 'My note' })
    expect(body.content).toBe('My note')
  })

  it('maps contact_id to candidate_id', () => {
    const body = untransformNote({ contact_id: 'cont_jane' })
    expect(body.candidate_id).toBe('cont_jane')
  })

  it('maps deal_id to job_id', () => {
    const body = untransformNote({ deal_id: 'job_303' })
    expect(body.job_id).toBe('job_303')
  })

  it('maps company_id', () => {
    const body = untransformNote({ company_id: 'co_202' })
    expect(body.company_id).toBe('co_202')
  })
})
