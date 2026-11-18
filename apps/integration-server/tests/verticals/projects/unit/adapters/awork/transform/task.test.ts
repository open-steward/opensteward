import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawAworkTask,
} from '../../../../../../../src/verticals/projects/adapters/awork/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('awork transformTask', () => {
  const raw: RawAworkTask = {
    id: 'task-awork-7',
    name: 'Design mockups',
    description: 'Create wireframes for the new UI.',
    taskStatusId: 'ts-2',
    taskStatus: { id: 'ts-2', name: 'In Progress', type: 'progress', order: 2 },
    isPrio: false,
    dueOn: '2024-06-30T00:00:00Z',
    plannedDuration: 480,
    projectId: 'proj-awork-1',
    baseType: 'projecttask',
    assignees: [
      { userId: 'usr-11', firstName: 'Alice' },
      { id: 'usr-22', userId: undefined },
    ],
    parentId: null,
    numberOfSubtasks: 3,
    createdOn: '2024-05-01T08:00:00Z',
    updatedOn: '2024-05-15T08:00:00Z',
    tags: [{ id: 'tag-1', name: 'design', color: '#aabbcc' }],
  }

  it('maps id and externalId', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('task-awork-7')
    expect(result.externalId).toBe('task-awork-7')
  })

  it('projectId falls back to raw.projectId when no arg given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj-awork-1')
  })

  it('caller-supplied projectId overrides raw.projectId', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('maps title from name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Design mockups')
  })

  it('maps description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Create wireframes for the new UI.')
  })

  it('status is in_progress for taskStatus.type=progress', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status is closed for taskStatus.type=done', () => {
    const result = transformTask({ ...raw, taskStatus: { type: 'done' } })
    expect(result.status).toBe('closed')
  })

  it('status is open for taskStatus.type=not-started', () => {
    const result = transformTask({ ...raw, taskStatus: { type: 'not-started' } })
    expect(result.status).toBe('open')
  })

  it('status is open for unknown taskStatus type', () => {
    const result = transformTask({ ...raw, taskStatus: { type: 'stuck' } })
    expect(result.status).toBe('open')
  })

  it('priority is undefined when isPrio is false', () => {
    const result = transformTask(raw)
    expect(result.priority).toBeUndefined()
  })

  it('priority is high when isPrio is true', () => {
    const result = transformTask({ ...raw, isPrio: true })
    expect(result.priority).toBe('high')
  })

  it('assigneeIds prefers userId over id', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toContain('usr-11')
    expect(result.assigneeIds).toContain('usr-22')
    expect(result.assigneeIds).toHaveLength(2)
  })

  it('tagIds mapped from tags[].id', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['tag-1'])
  })

  it('subtaskCount from numberOfSubtasks', () => {
    const result = transformTask(raw)
    expect(result.subtaskCount).toBe(3)
  })

  it('parentId is undefined when raw.parentId is null', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('parentId is set when raw.parentId is a string', () => {
    const result = transformTask({ ...raw, parentId: 'task-parent-1' })
    expect(result.parentId).toBe('task-parent-1')
  })

  it('dueDate maps from dueOn', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-06-30T00:00:00.000Z')
  })

  it('createdAt maps from createdOn', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2024-05-01T08:00:00.000Z')
  })

  it('platform is awork', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('awork')
  })

  it('metadata.baseType is set', () => {
    const result = transformTask(raw)
    expect(result.metadata.baseType).toBe('projecttask')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
