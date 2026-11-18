import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawWorkfrontTask,
} from '../../../../../../../src/verticals/projects/adapters/workfront/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('workfront transformTask', () => {
  const raw: RawWorkfrontTask = {
    ID: 'task-3',
    name: 'Design mockups',
    description: 'Create hi-fi wireframes',
    status: 'INP',
    priority: 3,
    assignedToID: 'user-9',
    parentID: null,
    projectID: 'proj-5',
    taskNumber: 7,
    numberOfChildren: 2,
    plannedCompletionDate: '2024-05-15T17:00:00.000Z',
    entryDate: '2024-01-20T00:00:00.000Z',
    lastUpdateDate: '2024-02-10T00:00:00.000Z',
    percentComplete: 60,
  }

  it('maps id and externalId from ID', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('task-3')
    expect(result.externalId).toBe('task-3')
  })

  it('maps title from name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Design mockups')
  })

  it('maps projectId from raw.projectID when no param', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj-5')
  })

  it('projectId param overrides raw.projectID', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('status INP maps to in_progress', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status NEW maps to open', () => {
    const result = transformTask({ ...raw, status: 'NEW' })
    expect(result.status).toBe('open')
  })

  it('status CPL maps to closed', () => {
    const result = transformTask({ ...raw, status: 'CPL' })
    expect(result.status).toBe('closed')
  })

  it('priority 3 maps to high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority 1 maps to low', () => {
    const result = transformTask({ ...raw, priority: 1 })
    expect(result.priority).toBe('low')
  })

  it('priority 2 maps to medium', () => {
    const result = transformTask({ ...raw, priority: 2 })
    expect(result.priority).toBe('medium')
  })

  it('priority 4 maps to urgent', () => {
    const result = transformTask({ ...raw, priority: 4 })
    expect(result.priority).toBe('urgent')
  })

  it('priority 0 maps to undefined', () => {
    const result = transformTask({ ...raw, priority: 0 })
    expect(result.priority).toBeUndefined()
  })

  it('maps assigneeIds from assignedToID', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['user-9'])
  })

  it('assigneeIds is empty when assignedToID is null', () => {
    const result = transformTask({ ...raw, assignedToID: null })
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds is always empty array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('maps subtaskCount from numberOfChildren', () => {
    const result = transformTask(raw)
    expect(result.subtaskCount).toBe(2)
  })

  it('maps dueDate from plannedCompletionDate', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-05-15T17:00:00.000Z')
  })

  it('parentId is undefined when parentID is null', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('parentId is set when parentID is present', () => {
    const result = transformTask({ ...raw, parentID: 'task-parent-1' })
    expect(result.parentId).toBe('task-parent-1')
  })

  it('platform is workfront', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('workfront')
  })

  it('metadata.platformType is task when no parent', () => {
    const result = transformTask(raw)
    expect(result.metadata.platformType).toBe('task')
  })

  it('metadata.platformType is subtask when parentID present', () => {
    const result = transformTask({ ...raw, parentID: 'task-parent-1' })
    expect(result.metadata.platformType).toBe('subtask')
  })

  it('metadata.statusCode is the raw status string', () => {
    const result = transformTask(raw)
    expect(result.metadata.statusCode).toBe('INP')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
