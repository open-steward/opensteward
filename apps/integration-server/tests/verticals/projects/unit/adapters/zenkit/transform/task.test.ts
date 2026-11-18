import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawAirtableTask,
} from '../../../../../../../src/verticals/projects/adapters/zenkit/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('zenkit transformTask', () => {
  const raw: RawAirtableTask = {
    gid: 'task-gid-1',
    name: 'Design new homepage',
    notes: 'Detailed description here',
    completed: false,
    due_on: '2024-03-15',
    due_at: '2024-03-15T12:00:00.000Z',
    parent: null,
    projects: [{ gid: 'proj-gid-1' }, { gid: 'proj-gid-2' }],
    assignee: { gid: 'user-gid-1' },
    tags: [{ gid: 'tag-1' }, { gid: 'tag-2' }],
    num_subtasks: 3,
    custom_fields: [{ name: 'Priority', enum_value: { name: 'High' }, display_value: 'High' }],
    created_at: '2024-01-15T10:00:00.000Z',
    modified_at: '2024-02-01T14:00:00.000Z',
    resource_subtype: 'default_task',
  }

  it('maps id and externalId from gid', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('task-gid-1')
    expect(result.externalId).toBe('task-gid-1')
  })

  it('maps title from name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Design new homepage')
  })

  it('maps description from notes', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Detailed description here')
  })

  it('maps projectId from argument when provided', () => {
    const result = transformTask(raw, 'override-proj')
    expect(result.projectId).toBe('override-proj')
  })

  it('maps projectId from first project.gid when argument absent', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj-gid-1')
  })

  it('projectId is empty string when projects absent and no arg', () => {
    const result = transformTask({ ...raw, projects: undefined })
    expect(result.projectId).toBe('')
  })

  it('maps parentId from parent.gid', () => {
    const result = transformTask({ ...raw, parent: { gid: 'parent-gid' } })
    expect(result.parentId).toBe('parent-gid')
  })

  it('parentId is undefined when parent is null', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('maps assigneeIds from assignee.gid', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['user-gid-1'])
  })

  it('assigneeIds is empty when assignee absent', () => {
    const result = transformTask({ ...raw, assignee: null })
    expect(result.assigneeIds).toEqual([])
  })

  it('maps tagIds from tags array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['tag-1', 'tag-2'])
  })

  it('tagIds is empty when tags absent', () => {
    const result = transformTask({ ...raw, tags: undefined })
    expect(result.tagIds).toEqual([])
  })

  it('maps subtaskCount from num_subtasks', () => {
    const result = transformTask(raw)
    expect(result.subtaskCount).toBe(3)
  })

  it('maps dueDate preferring due_at over due_on', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-03-15T12:00:00.000Z')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-01T14:00:00.000Z')
  })

  it('platform is zenkit', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('zenkit')
  })

  it('metadata platformType is task when no parent', () => {
    const result = transformTask(raw)
    expect(result.metadata.platformType).toBe('task')
  })

  it('metadata platformType is subtask when parent present', () => {
    const result = transformTask({ ...raw, parent: { gid: 'parent-gid' } })
    expect(result.metadata.platformType).toBe('subtask')
  })

  describe('status mapping', () => {
    it('completed=true maps to closed', () => {
      const result = transformTask({ ...raw, completed: true })
      expect(result.status).toBe('closed')
    })

    it('completed=false maps to open', () => {
      const result = transformTask({ ...raw, completed: false })
      expect(result.status).toBe('open')
    })

    it('absent completed maps to open', () => {
      const result = transformTask({ ...raw, completed: undefined })
      expect(result.status).toBe('open')
    })
  })

  describe('priority mapping via custom_fields', () => {
    it('High maps to high', () => {
      const result = transformTask(raw)
      expect(result.priority).toBe('high')
    })

    it('urgent maps to urgent', () => {
      const result = transformTask({
        ...raw,
        custom_fields: [
          { name: 'priority', enum_value: { name: 'Urgent' }, display_value: 'Urgent' },
        ],
      })
      expect(result.priority).toBe('urgent')
    })

    it('critical maps to urgent', () => {
      const result = transformTask({
        ...raw,
        custom_fields: [{ name: 'priority', display_value: 'Critical' }],
      })
      expect(result.priority).toBe('urgent')
    })

    it('medium maps to medium', () => {
      const result = transformTask({
        ...raw,
        custom_fields: [{ name: 'priority', display_value: 'Medium' }],
      })
      expect(result.priority).toBe('medium')
    })

    it('low maps to low', () => {
      const result = transformTask({
        ...raw,
        custom_fields: [{ name: 'priority', display_value: 'Low' }],
      })
      expect(result.priority).toBe('low')
    })

    it('absent priority custom field maps to undefined', () => {
      const result = transformTask({ ...raw, custom_fields: [] })
      expect(result.priority).toBeUndefined()
    })

    it('absent custom_fields maps to undefined', () => {
      const result = transformTask({ ...raw, custom_fields: undefined })
      expect(result.priority).toBeUndefined()
    })
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
