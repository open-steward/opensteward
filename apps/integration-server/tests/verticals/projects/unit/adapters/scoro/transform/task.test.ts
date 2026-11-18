import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawScoroTask,
} from '../../../../../../../src/verticals/projects/adapters/scoro/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('scoro transformTask', () => {
  const raw: RawScoroTask = {
    event_id: 201,
    event_name: 'Design mockups',
    description: 'Create high-fidelity mockups for approval.',
    status: 'task_status1',
    is_completed: false,
    priority_id: 1,
    project_id: 101,
    parent_id: null,
    related_users: [7, 8],
    datetime_due: '2026-04-30T17:00:00Z',
    start_datetime: '2026-04-01T09:00:00Z',
    created_date: '2026-03-25T08:00:00Z',
    modified_date: '2026-04-10T12:00:00Z',
    subtask_ids: [301, 302],
  }

  it('maps id and externalId from event_id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('201')
    expect(result.externalId).toBe('201')
  })

  it('maps title from event_name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Design mockups')
  })

  it('maps projectId from project_id when no override', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('101')
  })

  it('projectId override param takes priority', () => {
    const result = transformTask(raw, 'override-proj')
    expect(result.projectId).toBe('override-proj')
  })

  it('status is open when is_completed is false', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when is_completed is true', () => {
    const result = transformTask({ ...raw, is_completed: true })
    expect(result.status).toBe('closed')
  })

  it('status is closed when is_completed is 1', () => {
    const result = transformTask({ ...raw, is_completed: 1 })
    expect(result.status).toBe('closed')
  })

  it('priority_id 1 maps to high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority_id 2 maps to medium', () => {
    const result = transformTask({ ...raw, priority_id: 2 })
    expect(result.priority).toBe('medium')
  })

  it('priority_id 3 maps to low', () => {
    const result = transformTask({ ...raw, priority_id: 3 })
    expect(result.priority).toBe('low')
  })

  it('priority is undefined when priority_id is absent', () => {
    const result = transformTask({ ...raw, priority_id: undefined })
    expect(result.priority).toBeUndefined()
  })

  it('maps dueDate from datetime_due', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2026-04-30T17:00:00.000Z')
  })

  it('maps assigneeIds from related_users', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['7', '8'])
  })

  it('assigneeIds is empty array when related_users is absent', () => {
    const result = transformTask({ event_id: 1, related_users: undefined })
    expect(result.assigneeIds).toEqual([])
  })

  it('maps subtaskCount from subtask_ids length', () => {
    const result = transformTask(raw)
    expect(result.subtaskCount).toBe(2)
  })

  it('subtaskCount is undefined when subtask_ids is absent', () => {
    const result = transformTask({ event_id: 1 })
    expect(result.subtaskCount).toBeUndefined()
  })

  it('parentId is set when parent_id is provided', () => {
    const result = transformTask({ ...raw, parent_id: 50 })
    expect(result.parentId).toBe('50')
  })

  it('parentId is undefined when parent_id is null', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('maps createdAt from created_date', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2026-03-25T08:00:00.000Z')
  })

  it('maps updatedAt from modified_date', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBe('2026-04-10T12:00:00.000Z')
  })

  it('metadata.platformType is task when no parent_id', () => {
    const result = transformTask(raw)
    expect(result.metadata.platformType).toBe('task')
  })

  it('metadata.platformType is subtask when parent_id is set', () => {
    const result = transformTask({ ...raw, parent_id: 50 })
    expect(result.metadata.platformType).toBe('subtask')
  })

  it('platform is scoro', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('scoro')
  })

  it('tagIds is empty array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
