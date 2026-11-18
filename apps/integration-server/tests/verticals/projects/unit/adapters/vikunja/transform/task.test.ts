import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawVikunjaTask,
} from '../../../../../../../src/verticals/projects/adapters/vikunja/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('vikunja transformTask', () => {
  const raw: RawVikunjaTask = {
    id: 55,
    title: 'Fix login bug',
    description: 'Users cannot login with SSO.',
    done: false,
    done_at: null,
    due_date: '2024-04-30T00:00:00.000Z',
    project_id: 10,
    priority: 4,
    start_date: '2024-04-01T00:00:00.000Z',
    end_date: null,
    assignees: [
      { id: 1, username: 'alice', name: 'Alice', email: 'alice@example.com' },
      { id: 2, username: 'bob', name: 'Bob', email: 'bob@example.com' },
    ],
    labels: [
      { id: 7, title: 'Bug', hex_color: '#e11d48' },
      { id: 8, title: 'Urgent', hex_color: '#ff0000' },
    ],
    hex_color: '#aabbcc',
    percent_done: 0.25,
    identifier: 'FLB-55',
    index: 3,
    created: '2024-03-01T10:00:00.000Z',
    updated: '2024-03-15T12:00:00.000Z',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('maps title', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Fix login bug')
  })

  it('maps description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Users cannot login with SSO.')
  })

  it('maps projectId from project_id when no explicit projectId given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('10')
  })

  it('caller-supplied projectId takes precedence', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('maps status to open when done is false', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('maps status to closed when done is true', () => {
    const r: RawVikunjaTask = { id: 1, done: true }
    const result = transformTask(r)
    expect(result.status).toBe('closed')
  })

  it('maps priority 4 to high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('maps priority 5 to urgent', () => {
    const r: RawVikunjaTask = { id: 2, priority: 5 }
    const result = transformTask(r)
    expect(result.priority).toBe('urgent')
  })

  it('maps priority 3 to medium', () => {
    const r: RawVikunjaTask = { id: 3, priority: 3 }
    const result = transformTask(r)
    expect(result.priority).toBe('medium')
  })

  it('maps priority 1 to low', () => {
    const r: RawVikunjaTask = { id: 4, priority: 1 }
    const result = transformTask(r)
    expect(result.priority).toBe('low')
  })

  it('priority is undefined when priority is 0', () => {
    const r: RawVikunjaTask = { id: 5, priority: 0 }
    const result = transformTask(r)
    expect(result.priority).toBeUndefined()
  })

  it('priority is undefined when priority is absent', () => {
    const r: RawVikunjaTask = { id: 6 }
    const result = transformTask(r)
    expect(result.priority).toBeUndefined()
  })

  it('maps dueDate from due_date', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-04-30T00:00:00.000Z')
  })

  it('maps assigneeIds from assignees array', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['1', '2'])
  })

  it('assigneeIds is empty when assignees is null', () => {
    const r: RawVikunjaTask = { id: 7, assignees: null }
    const result = transformTask(r)
    expect(result.assigneeIds).toEqual([])
  })

  it('maps tagIds from labels array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['7', '8'])
  })

  it('tagIds is empty when labels is null', () => {
    const r: RawVikunjaTask = { id: 8, labels: null }
    const result = transformTask(r)
    expect(result.tagIds).toEqual([])
  })

  it('maps createdAt to ISO string', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2024-03-01T10:00:00.000Z')
  })

  it('maps updatedAt to ISO string', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBe('2024-03-15T12:00:00.000Z')
  })

  it('platform is vikunja', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('vikunja')
  })

  it('metadata contains identifier', () => {
    const result = transformTask(raw)
    expect(result.metadata.identifier).toBe('FLB-55')
  })

  it('metadata contains hexColor', () => {
    const result = transformTask(raw)
    expect(result.metadata.hexColor).toBe('#aabbcc')
  })

  it('parentId is always undefined (vikunja uses task relations, not parent_id)', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('projectId is empty string when project_id absent and no caller argument', () => {
    const r: RawVikunjaTask = { id: 9 }
    const result = transformTask(r)
    expect(result.projectId).toBe('')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
