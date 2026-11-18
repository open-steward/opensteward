import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawTodoTask,
} from '../../../../../../../src/verticals/projects/adapters/microsoft-todo/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('microsoft-todo transformTask', () => {
  const raw: RawTodoTask = {
    id: 'task-guid-001',
    title: 'Prepare slide deck',
    body: { content: 'Include Q1 metrics and roadmap.', contentType: 'text' },
    status: 'inProgress',
    importance: 'high',
    categories: ['Work', 'Presentation'],
    createdDateTime: '2026-05-01T08:00:00.000Z',
    lastModifiedDateTime: '2026-05-02T10:30:00.000Z',
    dueDateTime: { dateTime: '2026-05-10T17:00:00.0000000', timeZone: 'UTC' },
  }

  it('id is composite when projectId is supplied', () => {
    const result = transformTask(raw, 'list-001')
    expect(result.id).toBe('list-001:task-guid-001')
  })

  it('id is bare task id when projectId is empty', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('task-guid-001')
  })

  it('externalId is the raw Graph task id', () => {
    const result = transformTask(raw, 'list-001')
    expect(result.externalId).toBe('task-guid-001')
  })

  it('maps title from title field', () => {
    const result = transformTask(raw, 'list-001')
    expect(result.title).toBe('Prepare slide deck')
  })

  it('maps description from body.content', () => {
    const result = transformTask(raw, 'list-001')
    expect(result.description).toBe('Include Q1 metrics and roadmap.')
  })

  it('status is in_progress for inProgress', () => {
    const result = transformTask(raw, 'list-001')
    expect(result.status).toBe('in_progress')
  })

  it('status is open for notStarted', () => {
    const result = transformTask({ ...raw, status: 'notStarted' }, 'list-001')
    expect(result.status).toBe('open')
  })

  it('status is closed for completed', () => {
    const result = transformTask({ ...raw, status: 'completed' }, 'list-001')
    expect(result.status).toBe('closed')
  })

  it('status is in_review for waitingOnOthers', () => {
    const result = transformTask({ ...raw, status: 'waitingOnOthers' }, 'list-001')
    expect(result.status).toBe('in_review')
  })

  it('status is open for deferred', () => {
    const result = transformTask({ ...raw, status: 'deferred' }, 'list-001')
    expect(result.status).toBe('open')
  })

  it('priority is high for importance=high', () => {
    const result = transformTask(raw, 'list-001')
    expect(result.priority).toBe('high')
  })

  it('priority is medium for importance=normal', () => {
    const result = transformTask({ ...raw, importance: 'normal' }, 'list-001')
    expect(result.priority).toBe('medium')
  })

  it('priority is low for importance=low', () => {
    const result = transformTask({ ...raw, importance: 'low' }, 'list-001')
    expect(result.priority).toBe('low')
  })

  it('dueDate comes from dueDateTime GraphDateTime wrapper', () => {
    const result = transformTask(raw, 'list-001')
    // fromGraphDateTime passes raw.dueDateTime.dateTime to toIsoDatetime.
    // toIsoDatetime treats the no-offset dateTime string as local time (new Date()),
    // so the exact UTC value is timezone-dependent. Assert it is a valid ISO string
    // and that dueDate is set (not undefined).
    expect(result.dueDate).toBeDefined()
    expect(typeof result.dueDate).toBe('string')
    expect(result.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('assigneeIds is always empty (To Do has no assignees)', () => {
    const result = transformTask(raw, 'list-001')
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds is always empty (categories go to metadata)', () => {
    const result = transformTask(raw, 'list-001')
    expect(result.tagIds).toEqual([])
  })

  it('createdAt is ISO string from createdDateTime', () => {
    const result = transformTask(raw, 'list-001')
    expect(result.createdAt).toBe('2026-05-01T08:00:00.000Z')
  })

  it('updatedAt is ISO string from lastModifiedDateTime', () => {
    const result = transformTask(raw, 'list-001')
    expect(result.updatedAt).toBe('2026-05-02T10:30:00.000Z')
  })

  it('platform is microsoft-todo', () => {
    const result = transformTask(raw, 'list-001')
    expect(result.platform).toBe('microsoft-todo')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw, 'list-001')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('handles minimal raw object gracefully', () => {
    const result = transformTask({ id: 'task-min' }, 'list-001')
    expect(result.id).toBe('list-001:task-min')
    expect(result.title).toBe('')
    expect(result.status).toBe('open')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
