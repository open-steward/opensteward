import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawWorkbooksTask,
} from '../../../../../../../src/verticals/crm/adapters/workbooks/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawWorkbooksTask> = {}): RawWorkbooksTask {
  return { id: 'task-1', ...overrides }
}

describe('workbooks transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 42 })).id).toBe('42')
    expect(transformActivity(makeRaw({ id: 'task-99' })).id).toBe('task-99')
  })

  it('maps name to subject', () => {
    const result = transformActivity(makeRaw({ name: 'Discovery call' }))
    expect(result.subject).toBe('Discovery call')
  })

  it('maps description to note', () => {
    const result = transformActivity(makeRaw({ description: 'Call notes here' }))
    expect(result.note).toBe('Call notes here')
  })

  it('maps activity_type lowercased to type', () => {
    expect(transformActivity(makeRaw({ activity_type: 'Call' })).type).toBe('call')
    expect(transformActivity(makeRaw({ activity_type: 'MEETING' })).type).toBe('meeting')
  })

  it('sets type to undefined when activity_type is absent', () => {
    expect(transformActivity(makeRaw()).type).toBeUndefined()
  })

  it('maps done=true when activity_status is "complete"', () => {
    expect(transformActivity(makeRaw({ activity_status: 'complete' })).done).toBe(true)
  })

  it('maps done=true when activity_status is "completed"', () => {
    expect(transformActivity(makeRaw({ activity_status: 'Completed' })).done).toBe(true)
  })

  it('maps done=false when activity_status is something else', () => {
    expect(transformActivity(makeRaw({ activity_status: 'In Progress' })).done).toBe(false)
    expect(transformActivity(makeRaw({ activity_status: 'Not Started' })).done).toBe(false)
  })

  it('maps done=false when activity_status is absent', () => {
    expect(transformActivity(makeRaw()).done).toBe(false)
  })

  it('maps assigned_to_id to owner_id as string', () => {
    expect(transformActivity(makeRaw({ assigned_to_id: 7 })).owner_id).toBe('7')
    expect(transformActivity(makeRaw({ assigned_to_id: 'u-99' })).owner_id).toBe('u-99')
  })

  it('sets owner_id to undefined when assigned_to_id is absent', () => {
    expect(transformActivity(makeRaw()).owner_id).toBeUndefined()
  })

  it('maps due_date passthrough', () => {
    const result = transformActivity(makeRaw({ due_date: '2026-03-01T00:00:00.000Z' }))
    expect(result.due_date).toBe('2026-03-01T00:00:00.000Z')
  })

  it('converts duration to number', () => {
    expect(transformActivity(makeRaw({ duration: '30' })).duration_minutes).toBe(30)
    expect(transformActivity(makeRaw({ duration: 45 })).duration_minutes).toBe(45)
  })

  it('sets duration_minutes to undefined when duration is absent', () => {
    expect(transformActivity(makeRaw()).duration_minutes).toBeUndefined()
  })

  it('maps created_at and updated_at', () => {
    const result = transformActivity(
      makeRaw({
        created_at: '2026-01-15T09:30:00.000Z',
        updated_at: '2026-02-01T14:20:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('includes raw object in metadata', () => {
    const raw = makeRaw({ name: 'My task' })
    const result = transformActivity(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ActivitySchema.parse without throwing', () => {
    const raw = makeRaw({
      name: 'Discovery call',
      description: 'Follow up on Q1 expansion',
      activity_type: 'Call',
      activity_status: 'Complete',
      assigned_to_id: 'u-1',
      due_date: '2026-03-01T00:00:00.000Z',
      duration: 30,
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    })
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})

describe('workbooks untransformActivity', () => {
  it('maps subject back to name', () => {
    expect(untransformActivity({ subject: 'My Task' }).name).toBe('My Task')
  })

  it('maps note back to description', () => {
    expect(untransformActivity({ note: 'Some notes' }).description).toBe('Some notes')
  })

  it('maps done=true to activity_status Complete', () => {
    expect(untransformActivity({ done: true }).activity_status).toBe('Complete')
  })

  it('maps done=false to activity_status Not Started', () => {
    expect(untransformActivity({ done: false }).activity_status).toBe('Not Started')
  })

  it('maps due_date passthrough', () => {
    expect(untransformActivity({ due_date: '2026-03-01T00:00:00.000Z' }).due_date).toBe(
      '2026-03-01T00:00:00.000Z',
    )
  })

  it('omits fields not provided', () => {
    const result = untransformActivity({})
    expect(result).not.toHaveProperty('name')
    expect(result).not.toHaveProperty('description')
    expect(result).not.toHaveProperty('activity_status')
    expect(result).not.toHaveProperty('due_date')
  })

  it('round-trips subject, note, and done status', () => {
    const raw = makeRaw({
      name: 'Round-trip task',
      description: 'Some notes',
      activity_status: 'Complete',
    })
    const canonical = transformActivity(raw)
    const back = untransformActivity(canonical)
    expect(back.name).toBe('Round-trip task')
    expect(back.description).toBe('Some notes')
    expect(back.activity_status).toBe('Complete')
  })
})
