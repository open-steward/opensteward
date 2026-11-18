import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawSmartsuiteRecord,
} from '../../../../../../../src/verticals/projects/adapters/smartsuite/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('smartsuite transformTask', () => {
  const raw: RawSmartsuiteRecord = {
    id: 'rec_001',
    title: 'Implement OAuth flow',
    description: { html: '<p>Wire up the OAuth 2.0 flow.</p>' },
    assigned_to: ['mem_alice', 'mem_bob'],
    status: { value: 'in progress' },
    due_date: { from_date: '2026-05-01', to_date: '2026-05-07' },
    priority: 'high',
    first_created: { on: '2026-01-20T09:00:00.000Z', by: 'mem_alice' },
    last_updated: { on: '2026-04-15T14:00:00.000Z', by: 'mem_bob' },
    comments_count: 3,
    autonumber: 42,
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('rec_001')
    expect(result.externalId).toBe('rec_001')
  })

  it('maps title from raw.title', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Implement OAuth flow')
  })

  it('maps description from description.html', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('<p>Wire up the OAuth 2.0 flow.</p>')
  })

  it('description is undefined when description is null', () => {
    const result = transformTask({ ...raw, description: null })
    expect(result.description).toBeUndefined()
  })

  it('status in_progress maps from "in progress"', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status closed maps from "complete"', () => {
    const result = transformTask({ ...raw, status: { value: 'complete' } })
    expect(result.status).toBe('closed')
  })

  it('status cancelled maps from "cancelled"', () => {
    const result = transformTask({ ...raw, status: { value: 'cancelled' } })
    expect(result.status).toBe('cancelled')
  })

  it('status in_review maps from "in_review"', () => {
    const result = transformTask({ ...raw, status: { value: 'in_review' } })
    expect(result.status).toBe('in_review')
  })

  it('status open when status is absent', () => {
    const result = transformTask({ ...raw, status: null })
    expect(result.status).toBe('open')
  })

  it('priority high maps from "high"', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority urgent maps from "urgent"', () => {
    const result = transformTask({ ...raw, priority: 'urgent' })
    expect(result.priority).toBe('urgent')
  })

  it('priority medium maps from "medium"', () => {
    const result = transformTask({ ...raw, priority: 'medium' })
    expect(result.priority).toBe('medium')
  })

  it('priority low maps from "low"', () => {
    const result = transformTask({ ...raw, priority: 'low' })
    expect(result.priority).toBe('low')
  })

  it('priority undefined when priority is absent', () => {
    const result = transformTask({ ...raw, priority: null })
    expect(result.priority).toBeUndefined()
  })

  it('dueDate uses due_date.from_date', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2026-05-01T00:00:00.000Z')
  })

  it('dueDate falls back to to_date when from_date is absent', () => {
    const result = transformTask({
      ...raw,
      due_date: { from_date: undefined, to_date: '2026-05-07' },
    })
    expect(result.dueDate).toBe('2026-05-07T00:00:00.000Z')
  })

  it('maps assigneeIds from assigned_to array', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['mem_alice', 'mem_bob'])
  })

  it('assigneeIds is empty when assigned_to is absent', () => {
    const result = transformTask({ ...raw, assigned_to: undefined })
    expect(result.assigneeIds).toEqual([])
  })

  it('projectId uses tableId override param', () => {
    const result = transformTask(raw, 'app_table_001')
    expect(result.projectId).toBe('app_table_001')
  })

  it('projectId is empty string when no override', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('')
  })

  it('maps createdAt from first_created.on', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2026-01-20T09:00:00.000Z')
  })

  it('maps updatedAt from last_updated.on', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBe('2026-04-15T14:00:00.000Z')
  })

  it('stores commentsCount in metadata', () => {
    const result = transformTask(raw)
    expect(result.metadata.commentsCount).toBe('3')
  })

  it('stores autonumber in metadata', () => {
    const result = transformTask(raw)
    expect(result.metadata.autonumber).toBe('42')
  })

  it('platform is smartsuite', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('smartsuite')
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
