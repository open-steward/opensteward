import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawVitallyTask,
} from '../../../../../../../src/verticals/crm/adapters/vitally/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawVitallyTask> = {}): RawVitallyTask {
  return {
    id: 'task_001',
    name: 'Follow up call',
    description: 'Discuss Q1 expansion',
    accountId: 'acc_001',
    assignedToId: 'usr_owner',
    dueDate: '2026-03-01T10:00:00.000Z',
    completedAt: null,
    createdAt: '2026-01-15T09:30:00.000Z',
    updatedAt: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('vitally transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw()).id).toBe('task_001')
  })

  it('type is always task', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('maps name to subject', () => {
    expect(transformActivity(makeRaw()).subject).toBe('Follow up call')
  })

  it('subject is undefined when name is null', () => {
    expect(transformActivity(makeRaw({ name: null })).subject).toBeUndefined()
  })

  it('maps description to note', () => {
    expect(transformActivity(makeRaw()).note).toBe('Discuss Q1 expansion')
  })

  it('note is undefined when description is null', () => {
    expect(transformActivity(makeRaw({ description: null })).note).toBeUndefined()
  })

  it('maps accountId to company_id', () => {
    expect(transformActivity(makeRaw()).company_id).toBe('acc_001')
  })

  it('maps assignedToId to owner_id', () => {
    expect(transformActivity(makeRaw()).owner_id).toBe('usr_owner')
  })

  it('maps dueDate to due_date', () => {
    expect(transformActivity(makeRaw()).due_date).toBe('2026-03-01T10:00:00.000Z')
  })

  it('done is false when completedAt is null', () => {
    expect(transformActivity(makeRaw({ completedAt: null })).done).toBe(false)
  })

  it('done is true when completedAt is a string', () => {
    expect(transformActivity(makeRaw({ completedAt: '2026-02-28T12:00:00.000Z' })).done).toBe(true)
  })

  it('maps createdAt to created_at', () => {
    expect(transformActivity(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps updatedAt to updated_at', () => {
    expect(transformActivity(makeRaw()).updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw as metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => ActivitySchema.parse(transformActivity(makeRaw()))).not.toThrow()
  })

  it('handles minimal input without throwing', () => {
    const minimal: RawVitallyTask = { id: 'task_min' }
    expect(() => ActivitySchema.parse(transformActivity(minimal))).not.toThrow()
  })
})

describe('vitally untransformActivity', () => {
  it('maps subject to name', () => {
    const out = untransformActivity({ subject: 'My task' })
    expect(out.name).toBe('My task')
  })

  it('maps note to description', () => {
    const out = untransformActivity({ note: 'Some notes' })
    expect(out.description).toBe('Some notes')
  })

  it('maps company_id to accountId', () => {
    const out = untransformActivity({ company_id: 'acc_001' })
    expect(out.accountId).toBe('acc_001')
  })

  it('maps due_date to dueDate', () => {
    const out = untransformActivity({ due_date: '2026-03-01T10:00:00.000Z' })
    expect(out.dueDate).toBe('2026-03-01T10:00:00.000Z')
  })
})
