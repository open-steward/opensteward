import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawWeeekTask,
} from '../../../../../../../src/verticals/projects/adapters/weeek/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('weeek transformTask', () => {
  const raw: RawWeeekTask = {
    id: 999,
    parentId: null,
    title: 'Implement login',
    description: 'Build the login flow.',
    dateStart: '2026-01-10',
    dateEnd: '2026-02-15',
    priority: 3,
    isCompleted: false,
    isDeleted: false,
    authorId: 5,
    assignees: [7, 8],
    projectId: 42,
    boardId: 10,
    boardColumnId: 3,
    tags: [1, 2],
    type: 'action',
    isPrivate: false,
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('999')
    expect(result.externalId).toBe('999')
  })

  it('projectId falls back to raw.projectId when no override given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('42')
  })

  it('caller-supplied projectId overrides raw.projectId', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('maps title', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Implement login')
  })

  it('maps description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Build the login flow.')
  })

  it('status is open when isCompleted is false', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when isCompleted is true', () => {
    const result = transformTask({ ...raw, isCompleted: true })
    expect(result.status).toBe('closed')
  })

  it('priority 3 maps to high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority 4 maps to urgent', () => {
    const result = transformTask({ ...raw, priority: 4 })
    expect(result.priority).toBe('urgent')
  })

  it('priority 2 maps to medium', () => {
    const result = transformTask({ ...raw, priority: 2 })
    expect(result.priority).toBe('medium')
  })

  it('priority 1 maps to low', () => {
    const result = transformTask({ ...raw, priority: 1 })
    expect(result.priority).toBe('low')
  })

  it('priority 0 maps to undefined', () => {
    const result = transformTask({ ...raw, priority: 0 })
    expect(result.priority).toBeUndefined()
  })

  it('dueDate prefers dateEnd over dateStart', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe(new Date('2026-02-15').toISOString())
  })

  it('dueDate falls back to dateStart when dateEnd is absent', () => {
    const result = transformTask({ ...raw, dateEnd: null })
    expect(result.dueDate).toBe(new Date('2026-01-10').toISOString())
  })

  it('dueDate is undefined when both dateEnd and dateStart are absent', () => {
    const result = transformTask({ ...raw, dateEnd: null, dateStart: null })
    expect(result.dueDate).toBeUndefined()
  })

  it('assigneeIds maps from assignees array', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['7', '8'])
  })

  it('assigneeIds is empty when assignees is absent', () => {
    const result = transformTask({ ...raw, assignees: undefined })
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds maps from tags array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['1', '2'])
  })

  it('tagIds is empty when tags is absent', () => {
    const result = transformTask({ ...raw, tags: undefined })
    expect(result.tagIds).toEqual([])
  })

  it('parentId is undefined when raw.parentId is null', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('parentId is string when raw.parentId is numeric', () => {
    const result = transformTask({ ...raw, parentId: 55 })
    expect(result.parentId).toBe('55')
  })

  it('metadata.platformType is subtask when parentId is set', () => {
    const result = transformTask({ ...raw, parentId: 55 })
    expect(result.metadata.platformType).toBe('subtask')
  })

  it('metadata.platformType is task when parentId is absent', () => {
    const result = transformTask(raw)
    expect(result.metadata.platformType).toBe('task')
  })

  it('metadata.type reflects raw.type', () => {
    const result = transformTask(raw)
    expect(result.metadata.type).toBe('action')
  })

  it('platform is weeek', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('weeek')
  })

  it('title defaults to empty string when absent', () => {
    const result = transformTask({ id: 1 })
    expect(result.title).toBe('')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
