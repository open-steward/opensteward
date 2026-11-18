import { describe, it, expect } from 'vitest'
import {
  transformIssue,
  type RawMantisbtIssue,
} from '../../../../../../../src/verticals/projects/adapters/mantisbt/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('mantisbt transformIssue', () => {
  const raw: RawMantisbtIssue = {
    id: 1042,
    summary: 'Login button broken on mobile',
    description: 'Steps to reproduce: tap login on iOS 17.',
    project: { id: 7, name: 'Bug Tracker' },
    status: { id: 10, name: 'assigned', label: 'Assigned' },
    priority: { id: 40, name: 'high', label: 'High' },
    severity: { id: 50, name: 'major', label: 'Major' },
    resolution: { id: 10, name: 'open', label: 'Open' },
    handler: { id: 3, name: 'jdoe', real_name: 'Jane Doe', email: 'jane@example.com' },
    reporter: { id: 2, name: 'boss', real_name: 'The Boss', email: 'boss@example.com' },
    tags: [
      { id: 5, name: 'mobile' },
      { id: 8, name: 'regression' },
    ],
    created_at: '2026-04-01T08:00:00.000Z',
    updated_at: '2026-04-02T09:30:00.000Z',
    due_date: '2026-04-15T00:00:00.000Z',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformIssue(raw)
    expect(result.id).toBe('1042')
    expect(result.externalId).toBe('1042')
  })

  it('maps title from summary', () => {
    const result = transformIssue(raw)
    expect(result.title).toBe('Login button broken on mobile')
  })

  it('maps description', () => {
    const result = transformIssue(raw)
    expect(result.description).toBe('Steps to reproduce: tap login on iOS 17.')
  })

  it('projectId derives from project.id when no arg supplied', () => {
    const result = transformIssue(raw)
    expect(result.projectId).toBe('7')
  })

  it('caller-supplied projectId overrides raw.project.id', () => {
    const result = transformIssue(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('status is open for assigned', () => {
    const result = transformIssue(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed for resolved', () => {
    const result = transformIssue({ ...raw, status: { name: 'resolved' } })
    expect(result.status).toBe('closed')
  })

  it('status is closed for closed', () => {
    const result = transformIssue({ ...raw, status: { name: 'closed' } })
    expect(result.status).toBe('closed')
  })

  it('priority is high for high', () => {
    const result = transformIssue(raw)
    expect(result.priority).toBe('high')
  })

  it('priority is urgent for urgent', () => {
    const result = transformIssue({ ...raw, priority: { name: 'urgent' } })
    expect(result.priority).toBe('urgent')
  })

  it('priority is medium for normal', () => {
    const result = transformIssue({ ...raw, priority: { name: 'normal' } })
    expect(result.priority).toBe('medium')
  })

  it('priority is low for low', () => {
    const result = transformIssue({ ...raw, priority: { name: 'low' } })
    expect(result.priority).toBe('low')
  })

  it('assigneeIds contains handler id', () => {
    const result = transformIssue(raw)
    expect(result.assigneeIds).toEqual(['3'])
  })

  it('assigneeIds is empty when handler is absent', () => {
    const result = transformIssue({ ...raw, handler: null })
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds maps from tags array', () => {
    const result = transformIssue(raw)
    expect(result.tagIds).toEqual(['5', '8'])
  })

  it('tagIds is empty when tags is absent', () => {
    const result = transformIssue({ ...raw, tags: undefined })
    expect(result.tagIds).toEqual([])
  })

  it('dueDate is ISO string', () => {
    const result = transformIssue(raw)
    expect(result.dueDate).toBe('2026-04-15T00:00:00.000Z')
  })

  it('createdAt is ISO string', () => {
    const result = transformIssue(raw)
    expect(result.createdAt).toBe('2026-04-01T08:00:00.000Z')
  })

  it('updatedAt is ISO string', () => {
    const result = transformIssue(raw)
    expect(result.updatedAt).toBe('2026-04-02T09:30:00.000Z')
  })

  it('platform is mantisbt', () => {
    const result = transformIssue(raw)
    expect(result.platform).toBe('mantisbt')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformIssue(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('handles minimal raw object gracefully', () => {
    const result = transformIssue({ id: 1 }, 'proj-1')
    expect(result.id).toBe('1')
    expect(result.title).toBe('')
    expect(result.status).toBe('open')
    expect(result.assigneeIds).toEqual([])
    expect(result.tagIds).toEqual([])
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
