import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawRecruiterflowActivity,
} from '../../../../../../../src/verticals/crm/adapters/recruiterflow/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawRecruiterflowActivity> = {}): RawRecruiterflowActivity {
  return {
    id: 'act-1',
    activity_type: 'call',
    subject: 'Candidate screening',
    note: 'Discussed background and expectations',
    candidate_id: 'cand-42',
    client_id: 'client-7',
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-01-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('recruiterflow transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('act-1')
  })

  it('maps type from activity_type', () => {
    expect(transformActivity(makeRaw()).type).toBe('call')
  })

  it('maps subject', () => {
    expect(transformActivity(makeRaw()).subject).toBe('Candidate screening')
  })

  it('maps note', () => {
    expect(transformActivity(makeRaw()).note).toBe('Discussed background and expectations')
  })

  it('maps contact_id from candidate_id', () => {
    expect(transformActivity(makeRaw()).contact_id).toBe('cand-42')
  })

  it('maps company_id from client_id', () => {
    expect(transformActivity(makeRaw()).company_id).toBe('client-7')
  })

  it('maps created_at as ISO datetime', () => {
    expect(transformActivity(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps updated_at as ISO datetime', () => {
    expect(transformActivity(makeRaw()).updated_at).toBe('2026-01-20T12:00:00.000Z')
  })

  it('returns undefined contact_id when candidate_id absent', () => {
    expect(transformActivity(makeRaw({ candidate_id: undefined })).contact_id).toBeUndefined()
  })

  it('returns undefined company_id when client_id absent', () => {
    expect(transformActivity(makeRaw({ client_id: undefined })).company_id).toBeUndefined()
  })

  it('passes ActivitySchema validation', () => {
    expect(() => ActivitySchema.parse(transformActivity(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransformActivity round-trips subject', () => {
    expect(untransformActivity({ subject: 'Follow up' }).subject).toBe('Follow up')
  })

  it('untransformActivity maps type to activity_type', () => {
    expect(untransformActivity({ type: 'email' }).activity_type).toBe('email')
  })
})
