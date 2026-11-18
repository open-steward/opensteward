import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawActivecollabTask,
} from '../../../../../../../src/verticals/projects/adapters/activecollab/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('activecollab transformTask', () => {
  const raw: RawActivecollabTask = {
    id: 99,
    project_id: 42,
    name: 'Implement login',
    body: 'Build the login flow.',
    is_completed: false,
    assignee_id: 7,
    labels: [1, 3],
    total_subtasks: 2,
    due_on: 1710000000,
    created_on: 1700000000,
    updated_on: 1700001000,
    task_number: 5,
    task_list_id: 10,
    comments_count: 3,
    url_path: '/projects/42/tasks/99',
  }

  it('id is compound {projectId}:{taskId}', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('42:99')
  })

  it('externalId is the bare upstream task id', () => {
    const result = transformTask(raw)
    expect(result.externalId).toBe('99')
  })

  it('projectId is derived from project_id when no arg given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('42')
  })

  it('caller-supplied projectId overrides raw.project_id', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
    expect(result.id).toBe('proj-override:99')
  })

  it('maps title from name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Implement login')
  })

  it('maps description from body', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Build the login flow.')
  })

  it('status is open when is_completed is false', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when is_completed is true', () => {
    const result = transformTask({ ...raw, is_completed: true })
    expect(result.status).toBe('closed')
  })

  it('assigneeIds contains single assignee_id', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['7'])
  })

  it('assigneeIds is empty when assignee_id is absent', () => {
    const result = transformTask({ ...raw, assignee_id: null })
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds maps from labels array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['1', '3'])
  })

  it('subtaskCount reflects total_subtasks', () => {
    const result = transformTask(raw)
    expect(result.subtaskCount).toBe(2)
  })

  it('dueDate is converted from epoch seconds', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe(new Date(1710000000 * 1000).toISOString())
  })

  it('platform is activecollab', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('activecollab')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('id equals bare taskId when projectId is absent', () => {
    const result = transformTask({ id: 88 })
    expect(result.id).toBe('88')
    expect(result.externalId).toBe('88')
  })
})
