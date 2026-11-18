import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/twenty/transform/activity'
import { TASK } from '../fixtures'

describe('twenty transformActivity (Task)', () => {
  it('maps a documented Task record to a schema-valid Activity', () => {
    const out = ActivitySchema.parse(transformActivity(TASK))
    expect(out).toMatchObject({
      id: TASK.id,
      type: 'task',
      subject: 'Send the proposal',
      note: 'Draft and send the Q1 proposal',
      owner_id: TASK.assigneeId,
      due_date: TASK.dueAt,
      done: false,
      created_at: TASK.createdAt,
      updated_at: TASK.updatedAt,
    })
    expect(out.metadata).toEqual(TASK)
  })

  it('done is true only for the DONE status', () => {
    expect(transformActivity({ ...TASK, status: 'DONE' }).done).toBe(true)
    expect(transformActivity({ ...TASK, status: 'TODO' }).done).toBe(false)
  })

  it('an unset status leaves done unknown', () => {
    expect(transformActivity({ ...TASK, status: null }).done).toBeUndefined()
  })

  it('leaves optional fields absent when Twenty has none', () => {
    const out = ActivitySchema.parse(
      transformActivity({ ...TASK, title: null, bodyV2: null, dueAt: null, assigneeId: null }),
    )
    expect(out.subject).toBeUndefined()
    expect(out.note).toBeUndefined()
    expect(out.due_date).toBeUndefined()
    expect(out.owner_id).toBeUndefined()
  })

  it('refuses a record without an id', () => {
    expect(() => transformActivity({ ...TASK, id: undefined })).toThrow(/id/)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformActivity({ subject: 'Test', type: 'meeting' })
    expect(result.title).toBe('Test')
    expect(result.type).toBe('meeting')
  })
})
