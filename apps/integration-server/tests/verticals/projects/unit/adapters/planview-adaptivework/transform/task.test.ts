import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawClarizenTask,
} from '../../../../../../../src/verticals/projects/adapters/planview-adaptivework/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('planview-adaptivework transformTask', () => {
  const raw: RawClarizenTask = {
    id: '/Task/task-99',
    Name: 'Build API endpoint',
    Description: 'Implement REST endpoint',
    State: 'Active',
    PercentCompleted: 40,
    Priority: 'High',
    DueDate: '2026-04-15T00:00:00.000Z',
    WorkItemType: 'Task',
    Project: { id: '/Project/proj-1', Name: 'Platform Migration' },
    Parent: { id: '/Task/parent-5', Name: 'Backend Module' },
    Manager: { id: '/User/mgr-1', Name: 'Alice' },
    CreatedOn: '2026-01-10T08:00:00.000Z',
    LastUpdatedOn: '2026-02-01T14:20:00.000Z',
  }

  it('maps id and externalId directly from raw.id URI', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('/Task/task-99')
    expect(result.externalId).toBe('/Task/task-99')
  })

  it('maps title from raw.Name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Build API endpoint')
  })

  it('maps description from raw.Description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Implement REST endpoint')
  })

  it('projectId from raw.Project.id when no arg given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('/Project/proj-1')
  })

  it('projectId uses explicit arg over raw.Project', () => {
    const result = transformTask(raw, 'explicit-proj')
    expect(result.projectId).toBe('explicit-proj')
  })

  it('parentId from raw.Parent.id', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('/Task/parent-5')
  })

  it('parentId is undefined when Parent absent', () => {
    const result = transformTask({ ...raw, Parent: undefined })
    expect(result.parentId).toBeUndefined()
  })

  it('status is in_progress for "Active" state', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status is closed for "Completed" state', () => {
    const result = transformTask({ ...raw, State: 'Completed' })
    expect(result.status).toBe('closed')
  })

  it('status is cancelled for "Cancelled" state', () => {
    const result = transformTask({ ...raw, State: 'Cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('status is in_review for "In Review" state', () => {
    const result = transformTask({ ...raw, State: 'In Review' })
    expect(result.status).toBe('in_review')
  })

  it('status is open for "On Hold" state', () => {
    const result = transformTask({ ...raw, State: 'On Hold' })
    expect(result.status).toBe('open')
  })

  it('status falls back to PercentCompleted>=100 → closed', () => {
    const result = transformTask({ ...raw, State: undefined, PercentCompleted: 100 })
    expect(result.status).toBe('closed')
  })

  it('status falls back to PercentCompleted>0 → in_progress', () => {
    const result = transformTask({ ...raw, State: undefined, PercentCompleted: 50 })
    expect(result.status).toBe('in_progress')
  })

  it('status defaults to open when no State and PercentCompleted=0', () => {
    const result = transformTask({ ...raw, State: undefined, PercentCompleted: 0 })
    expect(result.status).toBe('open')
  })

  it('priority maps "High" → high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority maps "Critical" → urgent', () => {
    const result = transformTask({ ...raw, Priority: 'Critical' })
    expect(result.priority).toBe('urgent')
  })

  it('priority maps "Normal" → medium', () => {
    const result = transformTask({ ...raw, Priority: 'Normal' })
    expect(result.priority).toBe('medium')
  })

  it('priority maps "Low" → low', () => {
    const result = transformTask({ ...raw, Priority: 'Low' })
    expect(result.priority).toBe('low')
  })

  it('priority is undefined when absent', () => {
    const result = transformTask({ ...raw, Priority: undefined })
    expect(result.priority).toBeUndefined()
  })

  it('assigneeIds contains Manager.id', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['/User/mgr-1'])
  })

  it('assigneeIds is empty when Manager absent', () => {
    const result = transformTask({ ...raw, Manager: undefined })
    expect(result.assigneeIds).toEqual([])
  })

  it('dueDate from DueDate field', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2026-04-15T00:00:00.000Z')
  })

  it('createdAt from CreatedOn', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2026-01-10T08:00:00.000Z')
  })

  it('updatedAt from LastUpdatedOn', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('tagIds is empty array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('metadata.platformType is subtask when Parent is set', () => {
    const result = transformTask(raw)
    expect(result.metadata.platformType).toBe('subtask')
  })

  it('metadata.platformType is task when Parent absent', () => {
    const result = transformTask({ ...raw, Parent: undefined })
    expect(result.metadata.platformType).toBe('task')
  })

  it('metadata.workItemType from WorkItemType', () => {
    const result = transformTask(raw)
    expect(result.metadata.workItemType).toBe('Task')
  })

  it('platform is planview-adaptivework', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('planview-adaptivework')
  })

  it('raw is preserved on output', () => {
    const result = transformTask(raw)
    expect(result.raw).toBe(raw)
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
