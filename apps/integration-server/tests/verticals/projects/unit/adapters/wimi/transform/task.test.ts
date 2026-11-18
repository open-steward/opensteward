import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawLinearTask,
} from '../../../../../../../src/verticals/projects/adapters/wimi/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('wimi transformTask', () => {
  const raw: RawLinearTask = {
    gid: 'task-300',
    name: 'Implement OAuth flow',
    notes: 'Use PKCE extension',
    completed: false,
    due_at: '2024-04-30T17:00:00.000Z',
    parent: null,
    projects: [{ gid: 'proj-200' }],
    assignee: { gid: 'user-5' },
    tags: [{ gid: 'tag-7' }, { gid: 'tag-8' }],
    num_subtasks: 3,
    custom_fields: [{ name: 'Priority', enum_value: { name: 'High' }, display_value: 'High' }],
    created_at: '2024-01-05T09:00:00.000Z',
    modified_at: '2024-02-01T11:00:00.000Z',
    resource_subtype: 'default_task',
  }

  it('maps id and externalId from gid', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('task-300')
    expect(result.externalId).toBe('task-300')
  })

  it('maps title from name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Implement OAuth flow')
  })

  it('maps description from notes', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Use PKCE extension')
  })

  it('maps projectId from projects[0].gid when no param', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj-200')
  })

  it('projectId param overrides projects array', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('status is open when not completed', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when completed', () => {
    const result = transformTask({ ...raw, completed: true })
    expect(result.status).toBe('closed')
  })

  it('priority maps High → high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority maps Urgent → urgent', () => {
    const rawUrgent: RawLinearTask = {
      ...raw,
      custom_fields: [
        { name: 'Priority', enum_value: { name: 'Urgent' }, display_value: 'Urgent' },
      ],
    }
    const result = transformTask(rawUrgent)
    expect(result.priority).toBe('urgent')
  })

  it('priority is undefined when no priority custom field', () => {
    const result = transformTask({ ...raw, custom_fields: [] })
    expect(result.priority).toBeUndefined()
  })

  it('maps assigneeIds from assignee.gid', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['user-5'])
  })

  it('assigneeIds is empty when assignee is null', () => {
    const result = transformTask({ ...raw, assignee: null })
    expect(result.assigneeIds).toEqual([])
  })

  it('maps tagIds from tags[].gid', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['tag-7', 'tag-8'])
  })

  it('maps subtaskCount from num_subtasks', () => {
    const result = transformTask(raw)
    expect(result.subtaskCount).toBe(3)
  })

  it('maps dueDate from due_at', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-04-30T17:00:00.000Z')
  })

  it('parentId is undefined when parent is null', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('parentId is set when parent is present', () => {
    const result = transformTask({ ...raw, parent: { gid: 'task-parent-1' } })
    expect(result.parentId).toBe('task-parent-1')
  })

  it('platform is wimi', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('wimi')
  })

  it('metadata.platformType is task when no parent', () => {
    const result = transformTask(raw)
    expect(result.metadata.platformType).toBe('task')
  })

  it('metadata.platformType is subtask when parent present', () => {
    const result = transformTask({ ...raw, parent: { gid: 'task-parent-1' } })
    expect(result.metadata.platformType).toBe('subtask')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
