import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawProjectManagerTask,
} from '../../../../../../../src/verticals/projects/adapters/projectmanager/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('projectmanager transformTask', () => {
  const raw: RawProjectManagerTask = {
    id: 'task-uuid-77',
    projectId: 'proj-uuid-1',
    shortId: 'T-77',
    name: 'Implement OAuth flow',
    description: 'Add OAuth 2.0 support for enterprise customers.',
    status: { id: 'st-1', name: 'In Progress', isDone: false },
    assignees: [
      { id: 'user-a', name: 'Alice', email: 'alice@example.com' },
      { id: 'user-b', name: 'Bob', email: 'bob@example.com' },
    ],
    tags: [
      { id: 'tag-1', name: 'auth', color: '#aabbcc' },
      { id: 'tag-2', name: 'backend', color: null },
    ],
    plannedFinishDate: '2025-08-31T23:59:59.000Z',
    percentComplete: 50,
    isMilestone: false,
    isSummary: false,
    priorityId: 2,
    createDate: '2025-03-10T07:00:00.000Z',
    modifyDate: '2025-06-05T15:00:00.000Z',
  }

  it('maps id and externalId', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('task-uuid-77')
    expect(result.externalId).toBe('task-uuid-77')
  })

  it('maps title from name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Implement OAuth flow')
  })

  it('maps description correctly', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Add OAuth 2.0 support for enterprise customers.')
  })

  it('status in_progress when status name includes "progress"', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status closed when status.isDone is true', () => {
    const result = transformTask({ ...raw, status: { isDone: true, name: 'Done' } })
    expect(result.status).toBe('closed')
  })

  it('status open for an unrecognised status name', () => {
    const result = transformTask({ ...raw, status: { name: 'Backlog', isDone: false } })
    expect(result.status).toBe('open')
  })

  it('priority maps priorityId=2 to high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority maps priorityId=1 to urgent', () => {
    const result = transformTask({ ...raw, priorityId: 1 })
    expect(result.priority).toBe('urgent')
  })

  it('priority maps priorityId=3 to medium', () => {
    const result = transformTask({ ...raw, priorityId: 3 })
    expect(result.priority).toBe('medium')
  })

  it('priority maps priorityId>=4 to low', () => {
    const result = transformTask({ ...raw, priorityId: 5 })
    expect(result.priority).toBe('low')
  })

  it('priority is undefined when priorityId is null', () => {
    const result = transformTask({ ...raw, priorityId: null })
    expect(result.priority).toBeUndefined()
  })

  it('projectId comes from raw.projectId when argument omitted', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj-uuid-1')
  })

  it('projectId argument overrides raw.projectId', () => {
    const result = transformTask(raw, 'override-proj')
    expect(result.projectId).toBe('override-proj')
  })

  it('assigneeIds are extracted correctly', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['user-a', 'user-b'])
  })

  it('tagIds are extracted correctly', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['tag-1', 'tag-2'])
  })

  it('dueDate comes from plannedFinishDate', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2025-08-31T23:59:59.000Z')
  })

  it('createdAt and updatedAt are ISO 8601', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2025-03-10T07:00:00.000Z')
    expect(result.updatedAt).toBe('2025-06-05T15:00:00.000Z')
  })

  it('platform is projectmanager', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('projectmanager')
  })

  it('metadata includes shortId and statusName', () => {
    const result = transformTask(raw)
    expect(result.metadata.shortId).toBe('T-77')
    expect(result.metadata.statusName).toBe('In Progress')
  })

  it('metadata includes percentComplete', () => {
    const result = transformTask(raw)
    expect(result.metadata.percentComplete).toBe('50')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
