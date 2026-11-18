import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawNiftyTask,
} from '../../../../../../../src/verticals/projects/adapters/nifty/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

function makeTask(overrides: Partial<RawNiftyTask> = {}): RawNiftyTask {
  return {
    id: 'task-1',
    name: 'Design landing page',
    description: 'Create mockups for the new landing page.',
    project: 'proj-10',
    task_group_id: 'group-backlog',
    task_id: null,
    milestone_id: null,
    due_date: '2024-04-30T00:00:00.000Z',
    start_date: null,
    assignees: ['usr-alice', 'usr-bob'],
    labels: ['label-ui', 'label-design'],
    story_points: 5,
    completed: false,
    completed_on: null,
    archived: false,
    total_subtasks: 3,
    created_at: '2024-01-10T08:00:00.000Z',
    updated_at: '2024-01-20T12:00:00.000Z',
    created_by: 'usr-jane',
    ...overrides,
  }
}

describe('nifty transformTask', () => {
  it('maps id and externalId from raw.id', () => {
    const result = transformTask(makeTask())
    expect(result.id).toBe('task-1')
    expect(result.externalId).toBe('task-1')
  })

  it('maps projectId from explicit arg', () => {
    const result = transformTask(makeTask(), 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('falls back to raw.project for projectId', () => {
    const result = transformTask(makeTask())
    expect(result.projectId).toBe('proj-10')
  })

  it('maps title from raw.name', () => {
    const result = transformTask(makeTask())
    expect(result.title).toBe('Design landing page')
  })

  it('maps description from raw.description', () => {
    const result = transformTask(makeTask())
    expect(result.description).toBe('Create mockups for the new landing page.')
  })

  it('status is open when completed is false', () => {
    const result = transformTask(makeTask({ completed: false }))
    expect(result.status).toBe('open')
  })

  it('status is closed when completed is true', () => {
    const result = transformTask(makeTask({ completed: true }))
    expect(result.status).toBe('closed')
  })

  it('parentId is undefined when task_id is null', () => {
    const result = transformTask(makeTask({ task_id: null }))
    expect(result.parentId).toBeUndefined()
  })

  it('parentId is set from task_id for subtasks', () => {
    const result = transformTask(makeTask({ task_id: 'task-parent' }))
    expect(result.parentId).toBe('task-parent')
  })

  it('maps assigneeIds from raw.assignees', () => {
    const result = transformTask(makeTask())
    expect(result.assigneeIds).toEqual(['usr-alice', 'usr-bob'])
  })

  it('maps tagIds from raw.labels', () => {
    const result = transformTask(makeTask())
    expect(result.tagIds).toEqual(['label-ui', 'label-design'])
  })

  it('maps subtaskCount from raw.total_subtasks', () => {
    const result = transformTask(makeTask())
    expect(result.subtaskCount).toBe(3)
  })

  it('maps dueDate from raw.due_date', () => {
    const result = transformTask(makeTask())
    expect(result.dueDate).toBe('2024-04-30T00:00:00.000Z')
  })

  it('maps createdAt from raw.created_at', () => {
    const result = transformTask(makeTask())
    expect(result.createdAt).toBe('2024-01-10T08:00:00.000Z')
  })

  it('platform is nifty', () => {
    const result = transformTask(makeTask())
    expect(result.platform).toBe('nifty')
  })

  it('metadata.platformType is task when no task_id', () => {
    const result = transformTask(makeTask({ task_id: null }))
    expect(result.metadata.platformType).toBe('task')
  })

  it('metadata.platformType is subtask when task_id is present', () => {
    const result = transformTask(makeTask({ task_id: 'task-parent' }))
    expect(result.metadata.platformType).toBe('subtask')
  })

  it('metadata.taskGroupId reflects raw.task_group_id', () => {
    const result = transformTask(makeTask())
    expect(result.metadata.taskGroupId).toBe('group-backlog')
  })

  it('priority is undefined (nifty has no per-task priority)', () => {
    const result = transformTask(makeTask())
    expect(result.priority).toBeUndefined()
  })

  it('passes TaskSchema.parse without throwing', () => {
    const result = transformTask(makeTask())
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
