import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawSeatableRow,
} from '../../../../../../../src/verticals/projects/adapters/seatable/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('seatable transformTask', () => {
  const raw: RawSeatableRow = {
    _id: 'row_abc123xyz456789012',
    _ctime: '2026-01-10T08:00:00Z',
    _mtime: '2026-03-20T14:00:00Z',
    _creator: 'alice@example.com',
    _last_modifier: 'bob@example.com',
    Name: 'Set up CI pipeline',
    Description: 'Configure GitHub Actions for the project.',
    Status: 'in progress',
    Priority: 'high',
    Assignee: ['alice@example.com', 'bob@example.com'],
    'Due Date': '2026-04-30',
  }

  it('maps id and externalId from _id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('row_abc123xyz456789012')
    expect(result.externalId).toBe('row_abc123xyz456789012')
  })

  it('maps title from Name column', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Set up CI pipeline')
  })

  it('maps description from Description column', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Configure GitHub Actions for the project.')
  })

  it('status in_progress maps when Status is "in progress"', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status closed when Status is "done"', () => {
    const result = transformTask({ ...raw, Status: 'done' })
    expect(result.status).toBe('closed')
  })

  it('status open when Status is absent', () => {
    const result = transformTask({ _id: 'row-no-status' })
    expect(result.status).toBe('open')
  })

  it('priority high maps from Priority column', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority medium maps from "medium"', () => {
    const result = transformTask({ ...raw, Priority: 'medium' })
    expect(result.priority).toBe('medium')
  })

  it('priority urgent maps from "urgent"', () => {
    const result = transformTask({ ...raw, Priority: 'urgent' })
    expect(result.priority).toBe('urgent')
  })

  it('priority undefined when Priority column absent', () => {
    const result = transformTask({ _id: 'row-no-prio' })
    expect(result.priority).toBeUndefined()
  })

  it('maps assigneeIds from Assignee collaborator array', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['alice@example.com', 'bob@example.com'])
  })

  it('assigneeIds empty when no Assignee column', () => {
    const result = transformTask({ _id: 'row-no-assign' })
    expect(result.assigneeIds).toEqual([])
  })

  it('maps dueDate from Due Date column', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2026-04-30T00:00:00.000Z')
  })

  it('projectId uses override param', () => {
    const result = transformTask(raw, 'base-uuid-123')
    expect(result.projectId).toBe('base-uuid-123')
  })

  it('projectId is empty string when no override', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('')
  })

  it('maps createdAt from _ctime', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2026-01-10T08:00:00.000Z')
  })

  it('maps updatedAt from _mtime', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBe('2026-03-20T14:00:00.000Z')
  })

  it('stores creator in metadata', () => {
    const result = transformTask(raw)
    expect(result.metadata.creator).toBe('alice@example.com')
  })

  it('stores lastModifier in metadata', () => {
    const result = transformTask(raw)
    expect(result.metadata.lastModifier).toBe('bob@example.com')
  })

  it('title falls back to _id when no Name column', () => {
    const result = transformTask({ _id: 'row_fallback_id' })
    expect(result.title).toBe('row_fallback_id')
  })

  it('platform is seatable', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('seatable')
  })

  it('tagIds is empty array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
