import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawArtiaActivity,
} from '../../../../../../../src/verticals/projects/adapters/artia/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('artia transformTask', () => {
  const raw: RawArtiaActivity = {
    id: 'act-55',
    title: 'Set up CI pipeline',
    description: 'Configure GitHub Actions.',
    status: 'doing',
    customStatus: { id: 'cs-1', statusName: 'WIP', status: null },
    estimatedStart: '2024-02-01T00:00:00Z',
    estimatedEnd: '2024-02-15T00:00:00Z',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-20T10:00:00Z',
    responsible: { id: 'usr-7', name: 'Eve' },
    parent: null,
    folderId: '33',
    accountId: '99',
    communityId: 'comm-1',
    createdById: 'usr-1',
  }

  it('maps id and externalId from string id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('act-55')
    expect(result.externalId).toBe('act-55')
  })

  it('projectId falls back to folderId when no arg given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('33')
  })

  it('caller-supplied projectId overrides folderId', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('maps title', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Set up CI pipeline')
  })

  it('maps description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Configure GitHub Actions.')
  })

  it('status is in_progress for "doing"', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status is closed for "done"', () => {
    const result = transformTask({ ...raw, status: 'done' })
    expect(result.status).toBe('closed')
  })

  it('status is closed for "completed"', () => {
    const result = transformTask({ ...raw, status: 'completed' })
    expect(result.status).toBe('closed')
  })

  it('status is cancelled for "cancelled"', () => {
    const result = transformTask({ ...raw, status: 'cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('status is open for unknown values', () => {
    const result = transformTask({ ...raw, status: 'someunknown' })
    expect(result.status).toBe('open')
  })

  it('falls back to customStatus.status when raw.status is absent', () => {
    const result = transformTask({
      ...raw,
      status: null,
      customStatus: { id: 'cs-2', statusName: 'Done', status: 'done' },
    })
    expect(result.status).toBe('closed')
  })

  it('assigneeIds contains responsible.id', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['usr-7'])
  })

  it('assigneeIds is empty when responsible is absent', () => {
    const result = transformTask({ ...raw, responsible: null })
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds is always empty (Artia has no tag resource)', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('parentId is undefined when parent is null', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('parentId is set when parent is present', () => {
    const result = transformTask({ ...raw, parent: { id: 'act-parent-1' } })
    expect(result.parentId).toBe('act-parent-1')
  })

  it('dueDate maps from estimatedEnd', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-02-15T00:00:00.000Z')
  })

  it('platform is artia', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('artia')
  })

  it('metadata.isSubtask is set when parent is present', () => {
    const result = transformTask({ ...raw, parent: { id: 'p1' } })
    expect(result.metadata.isSubtask).toBe('true')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
