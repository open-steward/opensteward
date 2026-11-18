import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  type RawReplyIoTask,
} from '../../../../../../../src/verticals/crm/adapters/reply-io/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawReplyIoTask> = {}): RawReplyIoTask {
  return {
    id: 101,
    taskType: 'call',
    status: 'inProgress',
    assignedUserId: 55,
    contactId: 42,
    sequenceStepDisplayName: 'Intro call',
    dueTo: '2026-02-01T14:00:00.000Z',
    createdAt: '2026-01-15T09:30:00.000Z',
    finishedAt: null,
    ...overrides,
  }
}

describe('reply-io transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('101')
  })

  it('maps taskType "call" to canonical "call"', () => {
    expect(transformActivity(makeRaw()).type).toBe('call')
  })

  it('maps taskType "meeting" to canonical "meeting"', () => {
    expect(transformActivity(makeRaw({ taskType: 'meeting' })).type).toBe('meeting')
  })

  it('maps taskType "manualEmail" to canonical "email"', () => {
    expect(transformActivity(makeRaw({ taskType: 'manualEmail' })).type).toBe('email')
  })

  it('maps taskType "toDo" to canonical "task"', () => {
    expect(transformActivity(makeRaw({ taskType: 'toDo' })).type).toBe('task')
  })

  it('maps taskType "linkedIn" to canonical "task"', () => {
    expect(transformActivity(makeRaw({ taskType: 'linkedIn' })).type).toBe('task')
  })

  it('returns undefined type when taskType absent', () => {
    expect(transformActivity(makeRaw({ taskType: null })).type).toBeUndefined()
  })

  it('maps subject from sequenceStepDisplayName', () => {
    expect(transformActivity(makeRaw()).subject).toBe('Intro call')
  })

  it('falls back to taskType as subject when sequenceStepDisplayName absent', () => {
    const result = transformActivity(makeRaw({ sequenceStepDisplayName: null, taskType: 'call' }))
    expect(result.subject).toBe('call')
  })

  it('maps contact_id from contactId', () => {
    expect(transformActivity(makeRaw()).contact_id).toBe('42')
  })

  it('maps contact_id from contact.id in list shape', () => {
    const result = transformActivity(
      makeRaw({ contactId: null, contact: { id: 99, fullName: 'Jane' } }),
    )
    expect(result.contact_id).toBe('99')
  })

  it('maps owner_id from assignedUserId', () => {
    expect(transformActivity(makeRaw()).owner_id).toBe('55')
  })

  it('maps done=false when status is not "finished"', () => {
    expect(transformActivity(makeRaw({ status: 'inProgress' })).done).toBe(false)
  })

  it('maps done=true when status is "finished"', () => {
    expect(transformActivity(makeRaw({ status: 'finished' })).done).toBe(true)
  })

  it('maps done=undefined when status is null', () => {
    expect(transformActivity(makeRaw({ status: null })).done).toBeUndefined()
  })

  it('maps due_date as ISO datetime', () => {
    expect(transformActivity(makeRaw()).due_date).toBe('2026-02-01T14:00:00.000Z')
  })

  it('maps created_at from createdAt', () => {
    expect(transformActivity(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('passes ActivitySchema validation', () => {
    expect(() => ActivitySchema.parse(transformActivity(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })
})
