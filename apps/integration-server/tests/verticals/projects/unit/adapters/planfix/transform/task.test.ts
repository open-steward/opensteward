import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawPlanfixTask,
} from '../../../../../../../src/verticals/projects/adapters/planfix/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('planfix transformTask', () => {
  const raw: RawPlanfixTask = {
    id: 99,
    name: 'Design landing page',
    description: 'Create mockups',
    priority: 'High',
    status: { id: 5, name: 'In Progress', color: '#00f' },
    type: 'task',
    project: { id: 10 },
    parent: { id: 50 },
    assigner: { id: 'user:3', name: 'Bob' },
    dateTime: { datetime: '2026-01-10T08:00:00.000Z' },
    endDateTime: { datetime: '2026-02-28T23:59:00.000Z' },
    dateOfLastUpdate: { datetime: '2026-02-01T14:20:00.000Z' },
    assignees: {
      users: [
        { id: 'user:7', name: 'Jane' },
        { id: 'user:9', name: 'Alice' },
      ],
    },
  }

  it('maps id and externalId to string of numeric id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('99')
    expect(result.externalId).toBe('99')
  })

  it('maps title from raw.name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Design landing page')
  })

  it('maps description from raw.description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Create mockups')
  })

  it('projectId from raw.project.id when no arg given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('10')
  })

  it('projectId uses explicit arg over raw.project.id', () => {
    const result = transformTask(raw, 'proj-explicit')
    expect(result.projectId).toBe('proj-explicit')
  })

  it('parentId from raw.parent.id', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('50')
  })

  it('parentId is undefined when parent absent', () => {
    const result = transformTask({ ...raw, parent: undefined })
    expect(result.parentId).toBeUndefined()
  })

  it('status maps "In Progress" → in_progress', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status maps "Done" → closed', () => {
    const result = transformTask({ ...raw, status: { name: 'Done' } })
    expect(result.status).toBe('closed')
  })

  it('status maps "Cancelled" → cancelled', () => {
    const result = transformTask({ ...raw, status: { name: 'Cancelled' } })
    expect(result.status).toBe('cancelled')
  })

  it('status maps "Review" → in_review', () => {
    const result = transformTask({ ...raw, status: { name: 'In Review' } })
    expect(result.status).toBe('in_review')
  })

  it('status maps "New" → open', () => {
    const result = transformTask({ ...raw, status: { name: 'New' } })
    expect(result.status).toBe('open')
  })

  it('status defaults to open when status name is empty', () => {
    const result = transformTask({ ...raw, status: { name: '' } })
    expect(result.status).toBe('open')
  })

  it('status falls back to unknown for unrecognized status name', () => {
    const result = transformTask({ ...raw, status: { name: 'Zebra' } })
    expect(result.status).toBe('unknown')
  })

  it('priority maps "High" → high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority maps "urgent" → urgent', () => {
    const result = transformTask({ ...raw, priority: 'urgent' })
    expect(result.priority).toBe('urgent')
  })

  it('priority maps "critical" → urgent', () => {
    const result = transformTask({ ...raw, priority: 'critical' })
    expect(result.priority).toBe('urgent')
  })

  it('priority maps "medium" → medium', () => {
    const result = transformTask({ ...raw, priority: 'medium' })
    expect(result.priority).toBe('medium')
  })

  it('priority maps "low" → low', () => {
    const result = transformTask({ ...raw, priority: 'low' })
    expect(result.priority).toBe('low')
  })

  it('priority is undefined when raw.priority is absent', () => {
    const result = transformTask({ ...raw, priority: undefined })
    expect(result.priority).toBeUndefined()
  })

  it('dueDate from endDateTime', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2026-02-28T23:59:00.000Z')
  })

  it('createdAt from dateTime', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2026-01-10T08:00:00.000Z')
  })

  it('updatedAt from dateOfLastUpdate', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('assigneeIds from assignees.users ids', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['user:7', 'user:9'])
  })

  it('tagIds is empty array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('metadata.platformType is subtask when parentId is set', () => {
    const result = transformTask(raw)
    expect(result.metadata.platformType).toBe('subtask')
  })

  it('metadata.platformType is task when parent absent', () => {
    const result = transformTask({ ...raw, parent: undefined })
    expect(result.metadata.platformType).toBe('task')
  })

  it('platform is planfix', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('planfix')
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
