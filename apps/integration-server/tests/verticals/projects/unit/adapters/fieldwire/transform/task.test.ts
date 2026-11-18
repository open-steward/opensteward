import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawFieldwireTask,
} from '../../../../../../../src/verticals/projects/adapters/fieldwire/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('fieldwire transformTask', () => {
  const raw: RawFieldwireTask = {
    id: 'task-uuid-001',
    name: 'Install junction box in room 4B',
    project_id: 'proj-uuid-001',
    team_id: 'team-uuid-001',
    floorplan_id: 'fp-uuid-001',
    creator_user_id: 10,
    owner_user_id: 88,
    user_ids: [99, 100],
    priority: 1,
    status_id: 'status-uuid-open',
    due_date: '2026-05-01',
    due_at: '2026-05-01T17:00:00Z',
    start_at: null,
    end_at: null,
    fixed_at: null,
    verified_at: null,
    device_created_at: '2026-03-01T09:00:00Z',
    device_updated_at: '2026-03-20T10:00:00Z',
    is_local: false,
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('task-uuid-001')
    expect(result.externalId).toBe('task-uuid-001')
  })

  it('maps title from raw.name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Install junction box in room 4B')
  })

  it('maps projectId from raw.project_id', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('proj-uuid-001')
  })

  it('projectId uses override param when provided', () => {
    const result = transformTask(raw, 'override-proj-id')
    expect(result.projectId).toBe('override-proj-id')
  })

  it('status is open when neither fixed_at nor verified_at is set', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when fixed_at is present', () => {
    const result = transformTask({ ...raw, fixed_at: '2026-04-10T08:00:00Z' })
    expect(result.status).toBe('closed')
  })

  it('status is closed when verified_at is present', () => {
    const result = transformTask({ ...raw, verified_at: '2026-04-12T09:00:00Z' })
    expect(result.status).toBe('closed')
  })

  it('priority 1 maps to high', () => {
    const result = transformTask({ ...raw, priority: 1 })
    expect(result.priority).toBe('high')
  })

  it('priority 2 maps to medium', () => {
    const result = transformTask({ ...raw, priority: 2 })
    expect(result.priority).toBe('medium')
  })

  it('priority 3 maps to low', () => {
    const result = transformTask({ ...raw, priority: 3 })
    expect(result.priority).toBe('low')
  })

  it('priority is undefined when raw.priority is null', () => {
    const result = transformTask({ ...raw, priority: null })
    expect(result.priority).toBeUndefined()
  })

  it('dueDate prefers due_at over due_date', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2026-05-01T17:00:00.000Z')
  })

  it('dueDate falls back to due_date when due_at is absent', () => {
    const result = transformTask({ ...raw, due_at: null })
    expect(result.dueDate).toBe('2026-05-01T00:00:00.000Z')
  })

  it('assigneeIds starts with owner_user_id', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds[0]).toBe('88')
  })

  it('assigneeIds includes user_ids after owner', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toContain('99')
    expect(result.assigneeIds).toContain('100')
  })

  it('assigneeIds deduplicates owner if also in user_ids', () => {
    const result = transformTask({ ...raw, owner_user_id: 99, user_ids: [99, 100] })
    const count99 = result.assigneeIds.filter((id) => id === '99').length
    expect(count99).toBe(1)
  })

  it('assigneeIds is empty when owner_user_id is null and user_ids is empty', () => {
    const result = transformTask({ id: 'task-no-assign', owner_user_id: null, user_ids: [] })
    expect(result.assigneeIds).toEqual([])
  })

  it('maps createdAt and updatedAt from device timestamps', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2026-03-01T09:00:00.000Z')
    expect(result.updatedAt).toBe('2026-03-20T10:00:00.000Z')
  })

  it('maps metadata: teamId, floorplanId, statusId', () => {
    const result = transformTask(raw)
    expect(result.metadata.teamId).toBe('team-uuid-001')
    expect(result.metadata.floorplanId).toBe('fp-uuid-001')
    expect(result.metadata.statusId).toBe('status-uuid-open')
  })

  it('platform is fieldwire', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('fieldwire')
  })

  it('tagIds is an empty array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
