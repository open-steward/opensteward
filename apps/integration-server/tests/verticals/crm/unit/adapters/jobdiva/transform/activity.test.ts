import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  type RawJobdivaActivity,
} from '../../../../../../../src/verticals/crm/adapters/jobdiva/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawJobdivaActivity> = {}): RawJobdivaActivity {
  return { submittalid: '1', ...overrides }
}

describe('jobdiva transformActivity', () => {
  it('maps submittalid to string id (primary)', () => {
    expect(transformActivity(makeRaw({ submittalid: '42' })).id).toBe('42')
  })

  it('falls back to activityid when submittalid absent', () => {
    expect(transformActivity({ activityid: '7' }).id).toBe('7')
  })

  it('falls back to id when submittalid and activityid absent', () => {
    expect(transformActivity({ id: '3' }).id).toBe('3')
  })

  it('maps activitytype to type', () => {
    expect(transformActivity(makeRaw({ activitytype: 'interview' })).type).toBe('interview')
  })

  it('falls back to stage when activitytype absent', () => {
    expect(transformActivity({ stage: 'hire' }).type).toBe('hire')
  })

  it('maps subject', () => {
    expect(transformActivity(makeRaw({ subject: 'First interview' })).subject).toBe(
      'First interview',
    )
  })

  it('falls back to activitytype as subject when subject absent', () => {
    expect(
      transformActivity(makeRaw({ activitytype: 'submittal', subject: undefined })).subject,
    ).toBe('submittal')
  })

  it('maps notes to note', () => {
    expect(transformActivity(makeRaw({ notes: 'Good fit' })).note).toBe('Good fit')
  })

  it('maps candidateid to contact_id', () => {
    expect(transformActivity(makeRaw({ candidateid: '10' })).contact_id).toBe('10')
  })

  it('maps jobid to deal_id', () => {
    expect(transformActivity(makeRaw({ jobid: '20' })).deal_id).toBe('20')
  })

  it('maps clientid to company_id', () => {
    expect(transformActivity(makeRaw({ clientid: '30' })).company_id).toBe('30')
  })

  it('maps ownerid to owner_id', () => {
    expect(transformActivity(makeRaw({ ownerid: '5' })).owner_id).toBe('5')
  })

  it('maps activitydate to due_date', () => {
    expect(transformActivity(makeRaw({ activitydate: '2026-01-15T09:00:00.000Z' })).due_date).toBe(
      '2026-01-15T09:00:00.000Z',
    )
  })

  it('maps completed to done', () => {
    expect(transformActivity(makeRaw({ completed: true })).done).toBe(true)
  })

  it('maps createdat to created_at', () => {
    expect(transformActivity(makeRaw({ createdat: '2026-01-01T00:00:00.000Z' })).created_at).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('maps modifiedat to updated_at', () => {
    expect(transformActivity(makeRaw({ modifiedat: '2026-01-02T00:00:00.000Z' })).updated_at).toBe(
      '2026-01-02T00:00:00.000Z',
    )
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces an ActivitySchema-valid result', () => {
    const raw = makeRaw({
      submittalid: '1',
      activitytype: 'interview',
      subject: 'Technical screen',
      notes: 'Strong candidate',
      candidateid: '10',
      jobid: '20',
      clientid: '30',
      ownerid: '5',
      activitydate: '2026-01-15T09:00:00.000Z',
      completed: false,
      createdat: '2026-01-01T00:00:00.000Z',
      modifiedat: '2026-01-02T00:00:00.000Z',
    })
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})
