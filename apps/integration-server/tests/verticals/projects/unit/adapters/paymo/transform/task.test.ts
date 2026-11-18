import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawPaymoTask,
} from '../../../../../../../src/verticals/projects/adapters/paymo/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

const baseRaw: RawPaymoTask = {
  id: 301,
  name: 'Write unit tests',
  description: 'Cover all transform functions.',
  project_id: 201,
  tasklist_id: 50,
  complete: false,
  priority: 3,
  due_date: '2024-02-15T00:00:00.000Z',
  users: [11, 22],
  billable: false,
  created_on: '2024-01-15T12:00:00.000Z',
  updated_on: '2024-01-20T10:00:00.000Z',
}

describe('transformTask', () => {
  it('maps id and externalId as stringified numeric id', () => {
    const result = transformTask(baseRaw)
    expect(result.id).toBe('301')
    expect(result.externalId).toBe('301')
  })

  it('maps title from name field', () => {
    const result = transformTask(baseRaw)
    expect(result.title).toBe('Write unit tests')
  })

  it('maps description from description field', () => {
    const result = transformTask(baseRaw)
    expect(result.description).toBe('Cover all transform functions.')
  })

  it('maps status to open when complete is false', () => {
    const result = transformTask({ ...baseRaw, complete: false })
    expect(result.status).toBe('open')
  })

  it('maps status to closed when complete is true', () => {
    const result = transformTask({ ...baseRaw, complete: true })
    expect(result.status).toBe('closed')
  })

  it('defaults status to open when complete is undefined', () => {
    const raw: RawPaymoTask = { ...baseRaw, complete: undefined }
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('maps priority 1 to low', () => {
    const result = transformTask({ ...baseRaw, priority: 1 })
    expect(result.priority).toBe('low')
  })

  it('maps priority 2 to medium', () => {
    const result = transformTask({ ...baseRaw, priority: 2 })
    expect(result.priority).toBe('medium')
  })

  it('maps priority 3 to high', () => {
    const result = transformTask({ ...baseRaw, priority: 3 })
    expect(result.priority).toBe('high')
  })

  it('maps priority 4 to urgent', () => {
    const result = transformTask({ ...baseRaw, priority: 4 })
    expect(result.priority).toBe('urgent')
  })

  it('maps priority 0 to undefined', () => {
    const result = transformTask({ ...baseRaw, priority: 0 })
    expect(result.priority).toBeUndefined()
  })

  it('maps priority null to undefined', () => {
    const result = transformTask({ ...baseRaw, priority: null })
    expect(result.priority).toBeUndefined()
  })

  it('maps assigneeIds from users array as strings', () => {
    const result = transformTask(baseRaw)
    expect(result.assigneeIds).toEqual(['11', '22'])
  })

  it('produces empty assigneeIds when users is absent', () => {
    const raw: RawPaymoTask = { ...baseRaw, users: undefined }
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual([])
  })

  it('uses projectId arg when provided, overriding project_id field', () => {
    const result = transformTask(baseRaw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('falls back to project_id field when no arg given', () => {
    const result = transformTask(baseRaw)
    expect(result.projectId).toBe('201')
  })

  it('sets platform to paymo', () => {
    const result = transformTask(baseRaw)
    expect(result.platform).toBe('paymo')
  })

  it('maps dueDate from due_date as ISO string', () => {
    const result = transformTask(baseRaw)
    expect(result.dueDate).toBe(new Date('2024-02-15T00:00:00.000Z').toISOString())
  })

  it('sets tagIds to empty array', () => {
    const result = transformTask(baseRaw)
    expect(result.tagIds).toEqual([])
  })

  it('surfaces tasklistId and billable in metadata', () => {
    const result = transformTask(baseRaw)
    expect(result.metadata).toMatchObject({ tasklistId: '50' })
  })

  it('produces output that passes TaskSchema validation', () => {
    const result = transformTask(baseRaw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
