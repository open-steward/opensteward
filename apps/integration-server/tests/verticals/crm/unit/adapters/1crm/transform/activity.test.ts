import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type Raw1CrmTask,
} from '../../../../../../../src/verticals/crm/adapters/1crm/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<Raw1CrmTask> = {}): Raw1CrmTask {
  return { id: 'task-1', ...overrides }
}

describe('1crm transformActivity', () => {
  it('maps id to string', () => {
    expect(transformActivity(makeRaw({ id: 'task-42' })).id).toBe('task-42')
  })

  it('maps type to "task" always', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('maps subject from name field', () => {
    const result = transformActivity(makeRaw({ name: 'Follow-up call' }))
    expect(result.subject).toBe('Follow-up call')
  })

  it('maps note from description field', () => {
    const result = transformActivity(makeRaw({ description: 'Call notes here' }))
    expect(result.note).toBe('Call notes here')
  })

  it('maps done=true when status is Completed', () => {
    expect(transformActivity(makeRaw({ status: 'Completed' })).done).toBe(true)
  })

  it('maps done=false for non-Completed status', () => {
    expect(transformActivity(makeRaw({ status: 'In Progress' })).done).toBe(false)
    expect(transformActivity(makeRaw({ status: 'Not Started' })).done).toBe(false)
  })

  it('maps contact_id and owner_id', () => {
    const result = transformActivity(makeRaw({ contact_id: 'c-99', assigned_user_id: 'u-7' }))
    expect(result.contact_id).toBe('c-99')
    expect(result.owner_id).toBe('u-7')
  })

  it('converts due_date to ISO datetime', () => {
    const result = transformActivity(makeRaw({ date_due: '2026-03-01T00:00:00Z' }))
    expect(result.due_date).toMatch(/2026-03-01T00:00:00\.000Z/)
  })

  it('converts created_at/updated_at timestamps', () => {
    const result = transformActivity(
      makeRaw({
        date_entered: '2026-01-15T09:30:00Z',
        date_modified: '2026-02-01T14:20:00Z',
      }),
    )
    expect(result.created_at).toMatch(/2026-01-15/)
    expect(result.updated_at).toMatch(/2026-02-01/)
  })

  it('passes ActivitySchema.parse without throwing', () => {
    const raw = makeRaw({
      name: 'Task subject',
      description: 'Some notes',
      status: 'Completed',
      contact_id: 'c-1',
      assigned_user_id: 'u-1',
      date_due: '2026-03-01T10:00:00Z',
      date_entered: '2026-01-01T00:00:00Z',
      date_modified: '2026-01-02T00:00:00Z',
    })
    expect(() => ActivitySchema.parse(transformActivity(raw))).not.toThrow()
  })
})

describe('1crm untransformActivity', () => {
  it('maps subject back to name', () => {
    expect(untransformActivity({ subject: 'My Task' }).name).toBe('My Task')
  })

  it('maps note back to description', () => {
    expect(untransformActivity({ note: 'Some notes' }).description).toBe('Some notes')
  })

  it('maps done=true to status Completed', () => {
    expect(untransformActivity({ done: true }).status).toBe('Completed')
  })

  it('maps done=false to status Not Started', () => {
    expect(untransformActivity({ done: false }).status).toBe('Not Started')
  })

  it('round-trips through transform/untransform', () => {
    const raw = makeRaw({
      name: 'Round-trip task',
      description: 'Notes',
      contact_id: 'c-1',
      assigned_user_id: 'u-1',
      status: 'Not Started',
    })
    const canonical = transformActivity(raw)
    const back = untransformActivity(canonical)
    expect(back.name).toBe('Round-trip task')
    expect(back.description).toBe('Notes')
    expect(back.status).toBe('Not Started')
  })
})
