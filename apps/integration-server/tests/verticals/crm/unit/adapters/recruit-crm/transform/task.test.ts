/**
 * Fixture: the documented example values of the Task model in the Recruit CRM
 * API reference (https://docs.recruitcrm.io/docs/rcrm-api-reference/56abb1012ba1e-task).
 */
import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformTask,
  type RawRecruitCrmTask,
} from '../../../../../../../src/verticals/crm/adapters/recruit-crm/transform/task'

const DOC_TASK: RawRecruitCrmTask = {
  id: 2,
  title: 'Follow up call',
  task_type: [{ id: 1, label: 'Follow up' }],
  description: 'Make follow up call for interview',
  reminder: 30,
  start_date: '2020-06-29T05:36:22.000000Z',
  related_to: '23123',
  related_to_type: 'candidate',
  status: 'o',
  reminder_date: '2022-12-02T16:30:00.000000Z',
  owner: '10002',
  created_on: '2022-12-02T17:00:00.000000Z',
  updated_on: '2022-12-02T17:00:00.000000Z',
  created_by: '10022',
  updated_by: '10022',
}

describe('recruit-crm transformTask', () => {
  it('maps the documented example to a canonical activity', () => {
    const out = ActivitySchema.parse(transformTask(DOC_TASK))
    expect(out).toEqual({
      id: 'task_2',
      type: 'task',
      subject: 'Follow up call',
      note: 'Make follow up call for interview',
      due_date: '2020-06-29T05:36:22.000Z',
      owner_id: '10002',
      created_at: '2022-12-02T17:00:00.000Z',
      updated_at: '2022-12-02T17:00:00.000Z',
      metadata: DOC_TASK,
    })
  })

  it('does not map the related_to slug onto id-keyed links, nor status onto done', () => {
    const out = transformTask({ ...DOC_TASK, related_to_type: 'contact' })
    expect(out.contact_id).toBeUndefined()
    expect(out.done).toBeUndefined()
  })

  it('reads created_at from created_on and updated_at from updated_on', () => {
    // The documented example gives both fields one value, so pin them apart.
    const out = transformTask({
      ...DOC_TASK,
      created_on: '2022-01-01T00:00:00.000000Z',
      updated_on: '2023-06-15T12:30:00.000000Z',
    })
    expect(out.created_at).toBe('2022-01-01T00:00:00.000Z')
    expect(out.updated_at).toBe('2023-06-15T12:30:00.000Z')
  })

  it('parses with only the id present', () => {
    expect(ActivitySchema.parse(transformTask({ id: 7 })).id).toBe('task_7')
  })

  it('throws on a task with no id', () => {
    expect(() => transformTask({} as RawRecruitCrmTask)).toThrow(/no id/)
  })
})
