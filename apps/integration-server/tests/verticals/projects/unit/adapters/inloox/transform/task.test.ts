import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawInlooxTask,
} from '../../../../../../../src/verticals/projects/adapters/inloox/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('inloox transformTask', () => {
  const raw: RawInlooxTask = {
    TaskId: 'task-uuid-5678',
    Name: 'Write integration spec',
    DescriptionHTML: '<p>Spec for the API integration</p>',
    ProjectId: 'proj-uuid-1234',
    StartDateTime: '2026-02-01T08:00:00Z',
    EndDateTime: '2026-02-15T17:00:00Z',
    WorkAmount: 8.5,
    GroupId: 'group-uuid-abc',
  }

  it('maps TaskId to id and externalId', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('task-uuid-5678')
    expect(result.externalId).toBe('task-uuid-5678')
  })

  it('maps raw ProjectId to projectId when no override supplied', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj-uuid-1234')
  })

  it('caller-supplied projectId overrides raw.ProjectId', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('maps Name to title', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Write integration spec')
  })

  it('maps DescriptionHTML to description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('<p>Spec for the API integration</p>')
  })

  it('status is always "open"', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('parentId is always undefined', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('priority is always undefined', () => {
    const result = transformTask(raw)
    expect(result.priority).toBeUndefined()
  })

  it('assigneeIds is always an empty array', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds is always an empty array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('converts EndDateTime to dueDate ISO string', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe(new Date('2026-02-15T17:00:00Z').toISOString())
  })

  it('dueDate is undefined when EndDateTime is absent', () => {
    const result = transformTask({ ...raw, EndDateTime: undefined })
    expect(result.dueDate).toBeUndefined()
  })

  it('createdAt and updatedAt are always undefined', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('platform is "inloox"', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('inloox')
  })

  it('metadata.startDateTime preserves raw StartDateTime string', () => {
    const result = transformTask(raw)
    expect(result.metadata['startDateTime']).toBe('2026-02-01T08:00:00Z')
  })

  it('metadata.workAmount comes from WorkAmount as string', () => {
    const result = transformTask(raw)
    expect(result.metadata['workAmount']).toBe('8.5')
  })

  it('metadata.groupId comes from GroupId', () => {
    const result = transformTask(raw)
    expect(result.metadata['groupId']).toBe('group-uuid-abc')
  })

  it('metadata keys absent when fields are undefined', () => {
    const result = transformTask({ TaskId: 'a', Name: 'B', ProjectId: 'p' })
    expect(result.metadata['startDateTime']).toBeUndefined()
    expect(result.metadata['workAmount']).toBeUndefined()
    expect(result.metadata['groupId']).toBeUndefined()
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('handles minimal raw object gracefully', () => {
    const result = transformTask({}, 'proj-fallback')
    expect(result.id).toBe('')
    expect(result.projectId).toBe('proj-fallback')
    expect(result.title).toBe('')
    expect(result.status).toBe('open')
    expect(result.assigneeIds).toEqual([])
    expect(result.tagIds).toEqual([])
    expect(result.metadata).toEqual({})
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('falls back to empty string projectId when neither arg nor raw.ProjectId present', () => {
    const result = transformTask({ TaskId: 't1', Name: 'Task' })
    expect(result.projectId).toBe('')
  })
})
