import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawGanttproTask,
} from '../../../../../../../src/verticals/projects/adapters/ganttpro/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

const rawTask: RawGanttproTask = {
  id: 500,
  projectId: 42,
  ownerId: 99,
  name: 'Design mockups',
  description: 'Create initial wireframes',
  status: 2,
  priority: 4,
  parent: 10,
  type: 'task',
  progress: 50,
  startDate: '2026-05-01T00:00:00Z',
  endDate: '2026-05-15T00:00:00Z',
  deadline: '2026-05-14T00:00:00Z',
  duration: 14,
  estimation: 8,
  createdAt: '2026-04-20T10:00:00Z',
  color: '#ff0000',
}

describe('transformTask', () => {
  it('maps id to id as a string', () => {
    const result = transformTask(rawTask)
    expect(result.id).toBe('500')
    expect(result.externalId).toBe('500')
  })

  it('maps name to title', () => {
    const result = transformTask(rawTask)
    expect(result.title).toBe('Design mockups')
  })

  it('maps status 2 to "in_progress"', () => {
    const result = transformTask(rawTask)
    expect(result.status).toBe('in_progress')
  })

  it('maps status 1 to "open"', () => {
    const result = transformTask({ ...rawTask, status: 1 })
    expect(result.status).toBe('open')
  })

  it('maps status 3 to "closed"', () => {
    const result = transformTask({ ...rawTask, status: 3 })
    expect(result.status).toBe('closed')
  })

  it('maps status 4 to "closed"', () => {
    const result = transformTask({ ...rawTask, status: 4 })
    expect(result.status).toBe('closed')
  })

  it('maps priority 4 to "high"', () => {
    const result = transformTask(rawTask)
    expect(result.priority).toBe('high')
  })

  it('maps priority 5 to "urgent"', () => {
    const result = transformTask({ ...rawTask, priority: 5 })
    expect(result.priority).toBe('urgent')
  })

  it('maps priority 3 to "medium"', () => {
    const result = transformTask({ ...rawTask, priority: 3 })
    expect(result.priority).toBe('medium')
  })

  it('maps priority 2 to "low"', () => {
    const result = transformTask({ ...rawTask, priority: 2 })
    expect(result.priority).toBe('low')
  })

  it('maps priority 1 to "low"', () => {
    const result = transformTask({ ...rawTask, priority: 1 })
    expect(result.priority).toBe('low')
  })

  it('prefers deadline over endDate for dueDate', () => {
    const result = transformTask(rawTask)
    expect(result.dueDate).toBe('2026-05-14T00:00:00.000Z')
  })

  it('falls back to endDate for dueDate when deadline is absent', () => {
    const result = transformTask({ ...rawTask, deadline: undefined })
    expect(result.dueDate).toBe('2026-05-15T00:00:00.000Z')
  })

  it('maps parent to parentId as string', () => {
    const result = transformTask(rawTask)
    expect(result.parentId).toBe('10')
  })

  it('maps ownerId to assigneeIds[0] as string', () => {
    const result = transformTask(rawTask)
    expect(result.assigneeIds).toEqual(['99'])
  })

  it('returns empty assigneeIds when ownerId is absent', () => {
    const result = transformTask({ ...rawTask, ownerId: undefined })
    expect(result.assigneeIds).toEqual([])
  })

  it('uses projectId param over raw projectId', () => {
    const result = transformTask(rawTask, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('falls back to raw projectId when param not provided', () => {
    const result = transformTask(rawTask)
    expect(result.projectId).toBe('42')
  })

  it('maps createdAt to ISO string', () => {
    const result = transformTask(rawTask)
    expect(result.createdAt).toBe('2026-04-20T10:00:00.000Z')
  })

  it('sets platform to "ganttpro"', () => {
    const result = transformTask(rawTask)
    expect(result.platform).toBe('ganttpro')
  })

  it('passes schema validation', () => {
    const result = transformTask(rawTask)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('returns undefined priority when priority is absent', () => {
    const result = transformTask({ ...rawTask, priority: undefined })
    expect(result.priority).toBeUndefined()
  })

  it('defaults status to "open" when status is absent', () => {
    const result = transformTask({ ...rawTask, status: undefined })
    expect(result.status).toBe('open')
  })
})
