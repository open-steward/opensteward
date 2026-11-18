import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawManatalActivity,
} from '../../../../../../../src/verticals/crm/adapters/manatal/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawManatalActivity> = {}): RawManatalActivity {
  return { id: 1, ...overrides }
}

describe('manatal transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps activity_type to both type and subject', () => {
    const result = transformActivity(makeRaw({ activity_type: 'interview' }))
    expect(result.type).toBe('interview')
    expect(result.subject).toBe('interview')
  })

  it('maps description to note', () => {
    expect(transformActivity(makeRaw({ description: 'Phone screen done' })).note).toBe(
      'Phone screen done',
    )
  })

  it('maps _candidate_id to contact_id', () => {
    expect(transformActivity(makeRaw({ _candidate_id: 'cand_99' })).contact_id).toBe('cand_99')
  })

  it('falls back to _contact_id when _candidate_id absent', () => {
    expect(transformActivity(makeRaw({ _contact_id: 'cont_55' })).contact_id).toBe('cont_55')
  })

  it('maps _job_id to deal_id', () => {
    expect(transformActivity(makeRaw({ _job_id: 'job_7' })).deal_id).toBe('job_7')
  })

  it('maps created_by to owner_id as string', () => {
    expect(transformActivity(makeRaw({ created_by: 5 })).owner_id).toBe('5')
  })

  it('returns undefined owner_id when created_by is null', () => {
    expect(transformActivity(makeRaw({ created_by: null })).owner_id).toBeUndefined()
  })

  it('maps scheduled_at to due_date', () => {
    const result = transformActivity(makeRaw({ scheduled_at: '2024-05-10T09:00:00.000Z' }))
    expect(result.due_date).toBe('2024-05-10T09:00:00.000Z')
  })

  it('maps created_at to IsoDatetime', () => {
    const result = transformActivity(makeRaw({ created_at: '2024-01-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2024-01-01T00:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('passes ActivitySchema validation', () => {
    const raw: RawManatalActivity = {
      id: 1,
      activity_type: 'call',
      description: 'Initial outreach',
      created_by: 3,
      scheduled_at: '2024-04-01T10:00:00.000Z',
      created_at: '2024-03-15T09:30:00.000Z',
      updated_at: '2024-03-16T09:30:00.000Z',
      _candidate_id: 'cand_10',
    }
    const result = transformActivity(raw)
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('manatal untransformActivity', () => {
  it('maps type to activity_type', () => {
    expect(untransformActivity({ type: 'call' }).activity_type).toBe('call')
  })

  it('maps note to description', () => {
    expect(untransformActivity({ note: 'Follow up' }).description).toBe('Follow up')
  })

  it('maps due_date to scheduled_at', () => {
    expect(untransformActivity({ due_date: '2024-05-01T00:00:00.000Z' }).scheduled_at).toBe(
      '2024-05-01T00:00:00.000Z',
    )
  })
})
