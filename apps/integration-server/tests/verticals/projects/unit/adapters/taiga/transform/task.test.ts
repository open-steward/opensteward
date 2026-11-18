import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawTaigaTask,
} from '../../../../../../../src/verticals/projects/adapters/taiga/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('taiga transformTask', () => {
  const raw: RawTaigaTask = {
    id: 301,
    ref: 42,
    subject: 'Implement login flow',
    description: 'Build the full login flow with OAuth.',
    is_closed: false,
    status: { id: 2, name: 'In progress' },
    project: 88,
    user_story: 200,
    assigned_to: 5,
    assigned_to_extra_info: { id: 5 },
    owner: 3,
    tags: [
      ['frontend', '#ff0000'],
      ['auth', null],
    ],
    due_date: '2026-04-01',
    created_date: '2026-01-15T00:00:00.000Z',
    modified_date: '2026-02-10T00:00:00.000Z',
    priority: { name: 'high' },
    priority_extra_info: null,
    _resourceType: 'task',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('301')
    expect(result.externalId).toBe('301')
  })

  it('maps projectId from project field when no arg given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('88')
  })

  it('uses explicit projectId arg', () => {
    const result = transformTask(raw, 'override')
    expect(result.projectId).toBe('override')
  })

  it('maps title from subject', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Implement login flow')
  })

  it('maps description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Build the full login flow with OAuth.')
  })

  it('status is in_progress when status name includes "progress"', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status is closed when is_closed is true', () => {
    const result = transformTask({ ...raw, is_closed: true })
    expect(result.status).toBe('closed')
  })

  it('status is open when status name has no special keyword', () => {
    const result = transformTask({ ...raw, status: { id: 1, name: 'New' } })
    expect(result.status).toBe('open')
  })

  it('priority is high for "high"', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority is urgent for "critical"', () => {
    const result = transformTask({ ...raw, priority: { name: 'critical' } })
    expect(result.priority).toBe('urgent')
  })

  it('priority is medium for "normal"', () => {
    const result = transformTask({ ...raw, priority: { name: 'normal' } })
    expect(result.priority).toBe('medium')
  })

  it('priority is low for "low"', () => {
    const result = transformTask({ ...raw, priority: { name: 'low' } })
    expect(result.priority).toBe('low')
  })

  it('priority is undefined when no priority name', () => {
    const result = transformTask({ id: 1, priority: null })
    expect(result.priority).toBeUndefined()
  })

  it('maps assigneeIds from assigned_to', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['5'])
  })

  it('assigneeIds is empty when assigned_to is null', () => {
    const result = transformTask({ ...raw, assigned_to: null, assigned_to_extra_info: null })
    expect(result.assigneeIds).toEqual([])
  })

  it('maps parentId from user_story', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('200')
  })

  it('parentId is undefined when user_story is null', () => {
    const result = transformTask({ ...raw, user_story: null })
    expect(result.parentId).toBeUndefined()
  })

  it('maps tagIds from tags array (name is index 0)', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['frontend', 'auth'])
  })

  it('metadata.resourceType reflects the passed resourceType arg', () => {
    const result = transformTask(raw, undefined, 'userstory')
    expect(result.metadata.resourceType).toBe('userstory')
  })

  it('metadata.ref contains the ref number', () => {
    const result = transformTask(raw)
    expect(result.metadata.ref).toBe('42')
  })

  it('platform is taiga', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('taiga')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
