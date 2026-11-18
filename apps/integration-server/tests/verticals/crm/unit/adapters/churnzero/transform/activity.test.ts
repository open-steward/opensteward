import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawChurnZeroTask,
} from '../../../../../../../src/verticals/crm/adapters/churnzero/transform/activity'

function makeRaw(overrides: Partial<RawChurnZeroTask> = {}): RawChurnZeroTask {
  return { ...overrides }
}

describe('churnzero transformActivity', () => {
  it('maps numeric Id to string', () => {
    expect(transformActivity(makeRaw({ Id: 10 })).id).toBe('10')
  })

  it('maps string Id to string', () => {
    expect(transformActivity(makeRaw({ Id: 'TASK-1' })).id).toBe('TASK-1')
  })

  it('returns empty string when Id is absent', () => {
    expect(transformActivity(makeRaw()).id).toBe('')
  })

  it('always sets type to "task"', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('maps Subject to subject', () => {
    expect(transformActivity(makeRaw({ Subject: 'Follow up call' })).subject).toBe('Follow up call')
  })

  it('maps Notes to note', () => {
    expect(transformActivity(makeRaw({ Notes: 'Called, no answer.' })).note).toBe('Called, no answer.')
  })

  it('maps numeric ContactId to contact_id string', () => {
    expect(transformActivity(makeRaw({ ContactId: 55 })).contact_id).toBe('55')
  })

  it('maps string ContactId to contact_id', () => {
    expect(transformActivity(makeRaw({ ContactId: 'CON-5' })).contact_id).toBe('CON-5')
  })

  it('omits contact_id when ContactId is absent', () => {
    expect(transformActivity(makeRaw()).contact_id).toBeUndefined()
  })

  it('maps numeric AccountId to company_id string', () => {
    expect(transformActivity(makeRaw({ AccountId: 88 })).company_id).toBe('88')
  })

  it('maps string AccountId to company_id', () => {
    expect(transformActivity(makeRaw({ AccountId: 'ACC-2' })).company_id).toBe('ACC-2')
  })

  it('omits company_id when AccountId is absent', () => {
    expect(transformActivity(makeRaw()).company_id).toBeUndefined()
  })

  it('maps numeric AssignedUserId to owner_id string', () => {
    expect(transformActivity(makeRaw({ AssignedUserId: 3 })).owner_id).toBe('3')
  })

  it('maps DueDate', () => {
    expect(transformActivity(makeRaw({ DueDate: '2025-01-15T09:00:00Z' })).due_date).toBe('2025-01-15T09:00:00Z')
  })

  it('maps IsComplete true to done true', () => {
    expect(transformActivity(makeRaw({ IsComplete: true })).done).toBe(true)
  })

  it('maps IsComplete false to done false', () => {
    expect(transformActivity(makeRaw({ IsComplete: false })).done).toBe(false)
  })

  it('defaults done to false when IsComplete is absent', () => {
    expect(transformActivity(makeRaw()).done).toBe(false)
  })

  it('maps ObjectCreatedDate to created_at', () => {
    expect(transformActivity(makeRaw({ ObjectCreatedDate: '2024-02-01T00:00:00Z' })).created_at).toBe('2024-02-01T00:00:00Z')
  })

  it('maps ObjectLastModifiedDate to updated_at', () => {
    expect(transformActivity(makeRaw({ ObjectLastModifiedDate: '2024-07-01T00:00:00Z' })).updated_at).toBe('2024-07-01T00:00:00Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw({ Id: 'T1' })
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ Id: 10 }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('churnzero untransformActivity', () => {
  it('maps subject to Subject', () => {
    expect(untransformActivity({ subject: 'Check in' }).Subject).toBe('Check in')
  })

  it('maps note to Notes', () => {
    expect(untransformActivity({ note: 'Left voicemail' }).Notes).toBe('Left voicemail')
  })

  it('maps due_date to DueDate', () => {
    expect(untransformActivity({ due_date: '2025-03-01T00:00:00Z' }).DueDate).toBe('2025-03-01T00:00:00Z')
  })

  it('maps owner_id to AssignedUserId', () => {
    expect(untransformActivity({ owner_id: 'USR-9' }).AssignedUserId).toBe('USR-9')
  })

  it('maps done to IsComplete', () => {
    expect(untransformActivity({ done: true }).IsComplete).toBe(true)
  })

  it('omits keys not present in the input', () => {
    const out = untransformActivity({ subject: 'X' })
    expect(out).not.toHaveProperty('Notes')
    expect(out).not.toHaveProperty('DueDate')
  })
})
