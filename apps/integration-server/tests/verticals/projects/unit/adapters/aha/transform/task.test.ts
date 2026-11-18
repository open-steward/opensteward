import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawAhaFeature,
} from '../../../../../../../src/verticals/projects/adapters/aha/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('aha transformTask', () => {
  const raw: RawAhaFeature = {
    id: 'feat-789',
    reference_num: 'APP-1',
    name: 'User login',
    description: { id: 'd1', body: 'Implement OAuth2 login.' },
    workflow_status: { id: 'ws1', name: 'In progress', complete: false },
    assigned_to_user: { id: 'usr-5', name: 'Carol' },
    tags: ['backend', 'auth'],
    start_date: '2024-01-10',
    due_date: '2024-01-31',
    score: 80,
    progress: 40,
    product_id: 'prod-10',
    release: { id: 'rel-456' },
    epic: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-20T00:00:00Z',
  }

  it('maps id and externalId', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('feat-789')
    expect(result.externalId).toBe('feat-789')
  })

  it('projectId falls back to release.id when no arg given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('rel-456')
  })

  it('caller-supplied projectId overrides release.id', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('maps title from name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('User login')
  })

  it('maps description from description.body', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Implement OAuth2 login.')
  })

  it('status is in_progress for "In progress" workflow name', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status is closed when workflow_status.complete is true', () => {
    const result = transformTask({
      ...raw,
      workflow_status: { id: 'ws2', name: 'Done', complete: true },
    })
    expect(result.status).toBe('closed')
  })

  it('status is in_review for "In review" workflow name', () => {
    const result = transformTask({
      ...raw,
      workflow_status: { id: 'ws3', name: 'In review', complete: false },
    })
    expect(result.status).toBe('in_review')
  })

  it('status is cancelled for "will not implement" workflow name', () => {
    const result = transformTask({
      ...raw,
      workflow_status: { id: 'ws4', name: 'will not implement', complete: false },
    })
    expect(result.status).toBe('cancelled')
  })

  it('status is closed for "shipped" workflow name', () => {
    const result = transformTask({
      ...raw,
      workflow_status: { id: 'ws5', name: 'shipped', complete: false },
    })
    expect(result.status).toBe('closed')
  })

  it('status is open when workflow_status is absent', () => {
    const result = transformTask({ ...raw, workflow_status: null })
    expect(result.status).toBe('open')
  })

  it('assigneeIds contains assigned_to_user.id', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['usr-5'])
  })

  it('assigneeIds is empty when no assigned_to_user', () => {
    const result = transformTask({ ...raw, assigned_to_user: null })
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds are raw string tags from tags array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['backend', 'auth'])
  })

  it('parentId is undefined when epic is null', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('parentId is set from epic.id when epic is present', () => {
    const result = transformTask({ ...raw, epic: { id: 'epic-1' } })
    expect(result.parentId).toBe('epic-1')
  })

  it('dueDate maps from due_date ISO string', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBeDefined()
    expect(result.dueDate!.startsWith('2024-01-31')).toBe(true)
  })

  it('platform is aha', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('aha')
  })

  it('metadata.score is set', () => {
    const result = transformTask(raw)
    expect(result.metadata.score).toBe('80')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
