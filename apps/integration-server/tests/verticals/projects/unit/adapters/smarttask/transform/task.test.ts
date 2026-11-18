import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawSmarttaskTask,
} from '../../../../../../../src/verticals/projects/adapters/smarttask/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('smarttask transformTask', () => {
  const raw: RawSmarttaskTask = {
    record_id: 'task-uuid-001',
    organization_id: 7,
    name: 'Write unit tests',
    description: 'Cover all transform functions.',
    assigned_user: { user_id: 99, full_name: 'Alice Smith', email: 'alice@example.com' },
    priority: 'high',
    date_info: { start_date: '2026-04-01', due_date: '2026-04-30' },
    status: 0,
    estimated_time: 120,
    billable: true,
    projects: [{ ProjectId: 'proj-uuid-001', Name: 'Backend Sprint' }],
  }

  it('maps id and externalId from record_id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('task-uuid-001')
    expect(result.externalId).toBe('task-uuid-001')
  })

  it('maps title from name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Write unit tests')
  })

  it('maps description from description field', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Cover all transform functions.')
  })

  it('status 0 maps to open', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status 1 maps to closed', () => {
    const result = transformTask({ ...raw, status: 1 })
    expect(result.status).toBe('closed')
  })

  it('priority "high" maps to high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority "medium" maps to medium', () => {
    const result = transformTask({ ...raw, priority: 'medium' })
    expect(result.priority).toBe('medium')
  })

  it('priority "low" maps to low', () => {
    const result = transformTask({ ...raw, priority: 'low' })
    expect(result.priority).toBe('low')
  })

  it('priority "urgent" maps to urgent', () => {
    const result = transformTask({ ...raw, priority: 'urgent' })
    expect(result.priority).toBe('urgent')
  })

  it('priority undefined when priority is empty string', () => {
    const result = transformTask({ ...raw, priority: '' })
    expect(result.priority).toBeUndefined()
  })

  it('maps dueDate from date_info.due_date', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2026-04-30T00:00:00.000Z')
  })

  it('dueDate is undefined when date_info is null', () => {
    const result = transformTask({ ...raw, date_info: null })
    expect(result.dueDate).toBeUndefined()
  })

  it('maps assigneeIds from assigned_user.user_id', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['99'])
  })

  it('assigneeIds is empty when assigned_user is null', () => {
    const result = transformTask({ ...raw, assigned_user: null })
    expect(result.assigneeIds).toEqual([])
  })

  it('projectId uses override param', () => {
    const result = transformTask(raw, 'override-proj')
    expect(result.projectId).toBe('override-proj')
  })

  it('projectId falls back to first projects[0].ProjectId', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj-uuid-001')
  })

  it('projectId is empty string when no projects and no override', () => {
    const result = transformTask({ ...raw, projects: [] })
    expect(result.projectId).toBe('')
  })

  it('stores estimatedTime in metadata', () => {
    const result = transformTask(raw)
    expect(result.metadata.estimatedTime).toBe('120')
  })

  it('stores billable in metadata', () => {
    const result = transformTask(raw)
    expect(result.metadata.billable).toBe('true')
  })

  it('createdAt is undefined (not provided by API)', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBeUndefined()
  })

  it('updatedAt is undefined (not provided by API)', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBeUndefined()
  })

  it('platform is smarttask', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('smarttask')
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
