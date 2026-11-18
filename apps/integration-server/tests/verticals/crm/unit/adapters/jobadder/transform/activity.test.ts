import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  type RawJobAdderUserTask,
} from '../../../../../../../src/verticals/crm/adapters/jobadder/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawJobAdderUserTask> = {}): RawJobAdderUserTask {
  return { taskId: 1, ...overrides }
}

describe('jobadder transformActivity', () => {
  it('maps taskId to string id', () => {
    expect(transformActivity(makeRaw({ taskId: 42 })).id).toBe('42')
  })

  it('sets type to "task"', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('maps text to subject', () => {
    expect(transformActivity(makeRaw({ text: 'Call candidate' })).subject).toBe('Call candidate')
  })

  it('maps complete to done', () => {
    expect(transformActivity(makeRaw({ complete: true })).done).toBe(true)
    expect(transformActivity(makeRaw({ complete: false })).done).toBe(false)
  })

  it('maps owner.userId to owner_id', () => {
    expect(transformActivity(makeRaw({ owner: { userId: 7 } })).owner_id).toBe('7')
  })

  it('maps contacts[0].contactId to contact_id (takes precedence over candidates)', () => {
    const result = transformActivity(
      makeRaw({
        contacts: [{ contactId: 10 }],
        candidates: [{ candidateId: 20 }],
      }),
    )
    expect(result.contact_id).toBe('10')
  })

  it('falls back to candidates[0].candidateId for contact_id when no contacts', () => {
    const result = transformActivity(makeRaw({ candidates: [{ candidateId: 20 }] }))
    expect(result.contact_id).toBe('20')
  })

  it('maps companies[0].companyId to company_id', () => {
    expect(transformActivity(makeRaw({ companies: [{ companyId: 5 }] })).company_id).toBe('5')
  })

  it('maps jobs[0].jobId to deal_id', () => {
    expect(transformActivity(makeRaw({ jobs: [{ jobId: 99 }] })).deal_id).toBe('99')
  })

  it('computes duration_minutes from startAt and endAt', () => {
    const result = transformActivity(
      makeRaw({
        startAt: '2026-01-15T09:00:00.000Z',
        endAt: '2026-01-15T09:30:00.000Z',
      }),
    )
    expect(result.duration_minutes).toBe(30)
  })

  it('returns undefined duration_minutes when endAt is before startAt', () => {
    const result = transformActivity(
      makeRaw({
        startAt: '2026-01-15T09:30:00.000Z',
        endAt: '2026-01-15T09:00:00.000Z',
      }),
    )
    expect(result.duration_minutes).toBeUndefined()
  })

  it('maps startAt to due_date as ISO datetime', () => {
    const result = transformActivity(makeRaw({ startAt: '2026-01-15T09:00:00.000Z' }))
    expect(result.due_date).toBe('2026-01-15T09:00:00.000Z')
  })

  it('maps createdAt to created_at', () => {
    expect(transformActivity(makeRaw({ createdAt: '2026-01-01T00:00:00.000Z' })).created_at).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces an ActivitySchema-valid result', () => {
    const raw = makeRaw({
      taskId: 1,
      text: 'Check in',
      startAt: '2026-01-15T09:00:00.000Z',
      endAt: '2026-01-15T09:30:00.000Z',
      complete: false,
      owner: { userId: 3 },
      contacts: [{ contactId: 10 }],
      companies: [{ companyId: 5 }],
      jobs: [{ jobId: 99 }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})
