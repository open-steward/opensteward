import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawOraTask,
} from '../../../../../../../src/verticals/projects/adapters/ora/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('ora transformTask', () => {
  const raw: RawOraTask = {
    id: 'task_99',
    title: 'Design hero section',
    description: 'Create wireframes for the hero section.',
    project_id: 'proj_55',
    list_id: 'list_3',
    parent_id: null,
    due_date: '2026-07-01T00:00:00.000Z',
    completed: false,
    assignees: [{ id: 'usr_a' }, { id: 'usr_b' }],
    labels: [{ id: 'lbl_1' }, { id: 'lbl_2' }],
    priority: 3,
    created_at: '2026-01-15T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
  }

  it('maps id and title', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('task_99')
    expect(result.title).toBe('Design hero section')
  })

  it('maps description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Create wireframes for the hero section.')
  })

  it('maps projectId from raw.project_id', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj_55')
  })

  it('projectId argument overrides raw.project_id', () => {
    const result = transformTask(raw, 'proj_override')
    expect(result.projectId).toBe('proj_override')
  })

  it('parentId is undefined when parent_id is null', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('maps parentId when present', () => {
    const result = transformTask({ ...raw, parent_id: 'task_50' })
    expect(result.parentId).toBe('task_50')
  })

  it('status is open when completed is false', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when completed is true', () => {
    const result = transformTask({ ...raw, completed: true })
    expect(result.status).toBe('closed')
  })

  it('maps priority 3 → high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('maps priority 4 → urgent', () => {
    const result = transformTask({ ...raw, priority: 4 })
    expect(result.priority).toBe('urgent')
  })

  it('maps priority 2 → medium', () => {
    const result = transformTask({ ...raw, priority: 2 })
    expect(result.priority).toBe('medium')
  })

  it('maps priority 1 → low', () => {
    const result = transformTask({ ...raw, priority: 1 })
    expect(result.priority).toBe('low')
  })

  it('maps priority 0 → undefined (none)', () => {
    const result = transformTask({ ...raw, priority: 0 })
    expect(result.priority).toBeUndefined()
  })

  it('maps assigneeIds from assignees array', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['usr_a', 'usr_b'])
  })

  it('assigneeIds is empty when assignees is absent', () => {
    const result = transformTask({ ...raw, assignees: undefined })
    expect(result.assigneeIds).toEqual([])
  })

  it('maps tagIds from labels array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['lbl_1', 'lbl_2'])
  })

  it('maps dueDate', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2026-07-01T00:00:00.000Z')
  })

  it('platform is ora', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('ora')
  })

  it('metadata.listId is set', () => {
    const result = transformTask(raw)
    expect(result.metadata.listId).toBe('list_3')
  })

  it('metadata.isSubtask is set when parentId is present', () => {
    const result = transformTask({ ...raw, parent_id: 'task_50' })
    expect(result.metadata.isSubtask).toBe('true')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
