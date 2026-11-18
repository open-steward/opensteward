import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawPlaneIssue,
} from '../../../../../../../src/verticals/projects/adapters/plane/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('plane transformTask', () => {
  const raw: RawPlaneIssue = {
    id: 'issue-uuid-001',
    name: 'Fix null pointer dereference',
    description_html: '<p>Crashes on login.</p>',
    description_stripped: 'Crashes on login.',
    priority: 'high',
    state: 'state-uuid-001',
    assignees: ['user-uuid-a', 'user-uuid-b'],
    labels: ['label-uuid-x', 'label-uuid-y'],
    parent: null,
    project: 'project-uuid-001',
    workspace: 'workspace-uuid-001',
    sequence_id: 42,
    sub_issues_count: 3,
    start_date: '2024-01-15T12:00:00.000Z',
    target_date: '2024-02-28T00:00:00.000Z',
    completed_at: null,
    created_at: '2024-01-10T09:00:00.000Z',
    updated_at: '2024-01-20T14:00:00.000Z',
    created_by: 'user-uuid-creator',
  }

  it('id and externalId map from raw.id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('issue-uuid-001')
    expect(result.externalId).toBe('issue-uuid-001')
  })

  it('title maps from raw.name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Fix null pointer dereference')
  })

  it('description maps from description_stripped', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Crashes on login.')
  })

  it('projectId comes from raw.project when no arg given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('project-uuid-001')
  })

  it('caller-supplied projectId overrides raw.project', () => {
    const result = transformTask(raw, 'override-project-id')
    expect(result.projectId).toBe('override-project-id')
  })

  it('projectId is empty string when arg and raw.project are absent', () => {
    const result = transformTask({ ...raw, project: undefined })
    expect(result.projectId).toBe('')
  })

  it('status is open for stateGroup=backlog', () => {
    const result = transformTask(raw, undefined, 'backlog')
    expect(result.status).toBe('open')
  })

  it('status is open for stateGroup=unstarted', () => {
    const result = transformTask(raw, undefined, 'unstarted')
    expect(result.status).toBe('open')
  })

  it('status is in_progress for stateGroup=started', () => {
    const result = transformTask(raw, undefined, 'started')
    expect(result.status).toBe('in_progress')
  })

  it('status is closed for stateGroup=completed', () => {
    const result = transformTask(raw, undefined, 'completed')
    expect(result.status).toBe('closed')
  })

  it('status is cancelled for stateGroup=cancelled', () => {
    const result = transformTask(raw, undefined, 'cancelled')
    expect(result.status).toBe('cancelled')
  })

  it('status falls back to closed when completed_at is set and no stateGroup given', () => {
    const result = transformTask({ ...raw, completed_at: '2024-02-01T10:00:00.000Z' })
    expect(result.status).toBe('closed')
  })

  it('status falls back to open when completed_at is null and no stateGroup given', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('priority maps high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority maps urgent', () => {
    const result = transformTask({ ...raw, priority: 'urgent' })
    expect(result.priority).toBe('urgent')
  })

  it('priority maps medium', () => {
    const result = transformTask({ ...raw, priority: 'medium' })
    expect(result.priority).toBe('medium')
  })

  it('priority maps low', () => {
    const result = transformTask({ ...raw, priority: 'low' })
    expect(result.priority).toBe('low')
  })

  it('priority is undefined for none', () => {
    const result = transformTask({ ...raw, priority: 'none' })
    expect(result.priority).toBeUndefined()
  })

  it('priority is undefined when absent', () => {
    const result = transformTask({ ...raw, priority: undefined })
    expect(result.priority).toBeUndefined()
  })

  it('assigneeIds maps from raw.assignees', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['user-uuid-a', 'user-uuid-b'])
  })

  it('assigneeIds is empty array when assignees is absent', () => {
    const result = transformTask({ ...raw, assignees: undefined })
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds maps from raw.labels', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['label-uuid-x', 'label-uuid-y'])
  })

  it('tagIds is empty array when labels is absent', () => {
    const result = transformTask({ ...raw, labels: undefined })
    expect(result.tagIds).toEqual([])
  })

  it('subtaskCount maps from sub_issues_count', () => {
    const result = transformTask(raw)
    expect(result.subtaskCount).toBe(3)
  })

  it('dueDate maps from target_date', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-02-28T00:00:00.000Z')
  })

  it('parentId is undefined when parent is null', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('parentId maps from raw.parent when present', () => {
    const result = transformTask({ ...raw, parent: 'parent-uuid-001' })
    expect(result.parentId).toBe('parent-uuid-001')
  })

  it('metadata.platformType is issue when parent is null', () => {
    const result = transformTask(raw)
    expect(result.metadata['platformType']).toBe('issue')
  })

  it('metadata.platformType is subissue when parent is set', () => {
    const result = transformTask({ ...raw, parent: 'parent-uuid-001' })
    expect(result.metadata['platformType']).toBe('subissue')
  })

  it('metadata.sequenceId maps from sequence_id as string', () => {
    const result = transformTask(raw)
    expect(result.metadata['sequenceId']).toBe('42')
  })

  it('metadata.stateId maps from raw.state', () => {
    const result = transformTask(raw)
    expect(result.metadata['stateId']).toBe('state-uuid-001')
  })

  it('metadata.stateGroup maps from stateGroup arg', () => {
    const result = transformTask(raw, undefined, 'started')
    expect(result.metadata['stateGroup']).toBe('started')
  })

  it('platform is plane', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('plane')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw, undefined, 'started')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('passes TaskSchema.parse for subissue with all priorities', () => {
    const result = transformTask(
      { ...raw, parent: 'parent-uuid-001', priority: 'urgent' },
      'proj-id',
      'completed',
    )
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
