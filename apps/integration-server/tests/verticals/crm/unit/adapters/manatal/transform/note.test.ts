import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
  type RawManatalNote,
} from '../../../../../../../src/verticals/crm/adapters/manatal/transform/note'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'

function makeRaw(overrides: Partial<RawManatalNote> = {}): RawManatalNote {
  return { id: 1, ...overrides }
}

describe('manatal transformNote', () => {
  it('maps id to string', () => {
    expect(transformNote(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps content', () => {
    expect(transformNote(makeRaw({ content: 'Excellent candidate' })).content).toBe(
      'Excellent candidate',
    )
  })

  it('defaults content to empty string when absent', () => {
    expect(transformNote(makeRaw()).content).toBe('')
  })

  it('maps _candidate_id to contact_id', () => {
    expect(transformNote(makeRaw({ _candidate_id: 'cand_5' })).contact_id).toBe('cand_5')
  })

  it('falls back to _contact_id when _candidate_id absent', () => {
    expect(transformNote(makeRaw({ _contact_id: 'cont_7' })).contact_id).toBe('cont_7')
  })

  it('maps _organization_id to company_id', () => {
    expect(transformNote(makeRaw({ _organization_id: 'org_3' })).company_id).toBe('org_3')
  })

  it('maps _job_id to deal_id', () => {
    expect(transformNote(makeRaw({ _job_id: 'job_8' })).deal_id).toBe('job_8')
  })

  it('maps created_by to owner_id as string', () => {
    expect(transformNote(makeRaw({ created_by: 4 })).owner_id).toBe('4')
  })

  it('returns undefined owner_id when created_by is null', () => {
    expect(transformNote(makeRaw({ created_by: null })).owner_id).toBeUndefined()
  })

  it('maps created_at to IsoDatetime', () => {
    const result = transformNote(makeRaw({ created_at: '2024-03-15T10:00:00.000Z' }))
    expect(result.created_at).toBe('2024-03-15T10:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformNote(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformNote(raw).metadata).toBe(raw)
  })

  it('passes NoteSchema validation', () => {
    const raw: RawManatalNote = {
      id: 1,
      content: 'Great fit for the role',
      created_by: 4,
      created_at: '2024-01-15T09:30:00.000Z',
      updated_at: '2024-02-01T14:20:00.000Z',
      _candidate_id: 'cand_10',
    }
    const result = transformNote(raw)
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('manatal untransformNote', () => {
  it('maps content', () => {
    expect(untransformNote({ content: 'Strong candidate' }).content).toBe('Strong candidate')
  })
})
