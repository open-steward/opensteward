import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  taskFieldIds,
  transformActivity,
  untransformActivity,
} from '../../../../../../../src/verticals/crm/adapters/nethunt-crm/transform/activity'
import type { NetHuntField } from '../../../../../../../src/verticals/crm/adapters/nethunt-crm/types'
import { documentedRecord } from '../fixtures'

/** Tasks-folder fields with the documented roles; the ids are the workspace's own. */
const TASK_FIELDS: NetHuntField[] = [
  { id: 'name', name: 'Name', type: 'singleLineText', role: 'name' },
  { id: '11', name: 'Description', type: 'multiLineText', role: 'description' },
  { id: '12', name: 'Completed', type: 'checkbox', role: 'completed' },
  { id: '13', name: 'Due date', type: 'dateTime', role: 'dueDate' },
  { id: '14', name: 'Assignee', type: 'user', role: 'assignee' },
  { id: '15', name: 'Priority', type: 'dropdown', role: 'priority' },
  { id: '8', name: 'Industry', type: 'dropdown' },
]

function taskRecord(fields: Record<string, unknown>) {
  return documentedRecord({ fields: { name: 'Send proposal', ...fields } })
}

describe('nethunt-crm taskFieldIds', () => {
  it('reads the role-bound field ids and ignores fields without a role', () => {
    expect(taskFieldIds(TASK_FIELDS)).toEqual({
      description: '11',
      completed: '12',
      dueDate: '13',
      assignee: '14',
    })
  })

  it('is empty when the folder carries no fields', () => {
    expect(taskFieldIds(undefined)).toEqual({})
  })
})

describe('nethunt-crm transformActivity (Tasks-folder record)', () => {
  const ids = taskFieldIds(TASK_FIELDS)

  it('maps role-bound fields and parses as an Activity', () => {
    const raw = taskRecord({
      '11': 'Pricing for 50 seats',
      '12': true,
      '13': 1743465600000,
      '14': 'john@acme.com',
    })
    const out = ActivitySchema.parse(transformActivity(raw, ids))
    expect(out).toEqual({
      id: '5f8a2b1c3d4e5f6a7b8c9d0e',
      type: 'task',
      subject: 'Send proposal',
      note: 'Pricing for 50 seats',
      owner_id: 'john@acme.com',
      due_date: new Date(1743465600000).toISOString(),
      done: true,
      created_at: '2025-03-18T10:00:00.000Z',
      updated_at: '2025-03-19T14:23:11.000Z',
      metadata: raw,
    })
  })

  it('leaves a multi-user assignee in metadata', () => {
    const out = transformActivity(taskRecord({ '14': ['a@x.com', 'b@x.com'] }), ids)
    expect(out.owner_id).toBeUndefined()
  })

  it('omits what the record omits', () => {
    const out = ActivitySchema.parse(transformActivity(taskRecord({}), ids))
    expect(out.done).toBeUndefined()
    expect(out.due_date).toBeUndefined()
    expect(out.note).toBeUndefined()
  })

  it('reads no custom field without role ids', () => {
    const out = transformActivity(taskRecord({ '11': 'x', '12': true }))
    expect(out.note).toBeUndefined()
    expect(out.done).toBeUndefined()
  })
})

describe('nethunt-crm untransformActivity', () => {
  it('maps note to description', () => {
    expect(untransformActivity({ note: 'n' })).toEqual({ description: 'n' })
  })
})
