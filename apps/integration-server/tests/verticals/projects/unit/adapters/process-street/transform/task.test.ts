import { describe, it, expect } from 'vitest'
import {
  parseTaskId,
  transformTask,
} from '../../../../../../../src/verticals/projects/adapters/process-street/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'
import { JANE, RUN_ID, WORKFLOW_ID, task } from '../fixtures'

describe('process-street transformTask (documented ListTasksResponse.tasks[])', () => {
  it('parses against TaskSchema', () => {
    expect(() => TaskSchema.parse(transformTask(task(), WORKFLOW_ID))).not.toThrow()
  })

  it('id is <workflowRunId>:<taskId>; externalId is the task id', () => {
    const t = TaskSchema.parse(transformTask(task(), WORKFLOW_ID))
    expect(t.id).toBe(`${RUN_ID}:tAsKiDxxxxQBoNMM9kN7KA`)
    expect(t.externalId).toBe('tAsKiDxxxxQBoNMM9kN7KA')
    expect(parseTaskId(t.id)).toEqual({ workflowRunId: RUN_ID, taskId: 'tAsKiDxxxxQBoNMM9kN7KA' })
  })

  it('projectId is the workflow passed in; title, dueDate, updatedAt from documented fields', () => {
    const t = TaskSchema.parse(transformTask(task(), WORKFLOW_ID))
    expect(t.projectId).toBe(WORKFLOW_ID)
    expect(t.parentId).toBeUndefined()
    expect(t.title).toBe('Send welcome email')
    expect(t.dueDate).toBe('2024-09-20T17:00:00.000Z')
    expect(t.updatedAt).toBe('2024-09-15T14:32:00.000Z')
    expect(t.createdAt).toBeUndefined()
  })

  it('maps the documented status enum NotCompleted | Completed', () => {
    expect(
      TaskSchema.parse(transformTask(task({ status: 'NotCompleted' }), WORKFLOW_ID)).status,
    ).toBe('open')
    expect(TaskSchema.parse(transformTask(task({ status: 'Completed' }), WORKFLOW_ID)).status).toBe(
      'closed',
    )
    expect(TaskSchema.parse(transformTask(task({ status: 'Other' }), WORKFLOW_ID)).status).toBe(
      'unknown',
    )
  })

  it('completedBy is metadata, never an assignee', () => {
    const t = TaskSchema.parse(
      transformTask(
        task({ status: 'Completed', completedBy: JANE, completedDate: '2024-09-18T10:00:00.000Z' }),
        WORKFLOW_ID,
      ),
    )
    expect(t.assigneeIds).toEqual([])
    expect(t.metadata['completedById']).toBe(JANE.id)
    expect(t.metadata['completedDate']).toBe('2024-09-18T10:00:00.000Z')
  })

  it('keeps run id, taskType, hidden, stopped in metadata', () => {
    const t = TaskSchema.parse(transformTask(task({ stopped: true }), WORKFLOW_ID))
    expect(t.metadata).toMatchObject({
      workflowRunId: RUN_ID,
      status: 'NotCompleted',
      taskType: 'Standard',
      hidden: 'false',
      stopped: 'true',
    })
  })

  it('parseTaskId rejects ids that are not <run>:<task>', () => {
    expect(parseTaskId('abc')).toBeUndefined()
    expect(parseTaskId(':abc')).toBeUndefined()
    expect(parseTaskId('a:b:c')).toBeUndefined()
  })
})
