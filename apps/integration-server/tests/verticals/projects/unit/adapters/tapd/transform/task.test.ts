import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawTapdStory,
} from '../../../../../../../src/verticals/projects/adapters/tapd/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('tapd transformTask', () => {
  const raw: RawTapdStory = {
    id: 'story_001',
    name: 'User authentication',
    description: 'Implement OAuth2 login flow.',
    workspace_id: 'ws_12345',
    creator: 'alice',
    created: '2026-01-10T00:00:00.000Z',
    modified: '2026-02-20T00:00:00.000Z',
    status: 'in_progress',
    owner: 'alice;bob',
    begin: '2026-01-12',
    due: '2026-03-01',
    completed: '',
    priority_label: 'High',
    priority: '',
    iteration_id: 'iter_01',
    parent_id: '0',
    children_id: '',
    label: 'backend,security',
    is_archived: '0',
  }

  it('maps id and externalId from string id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('story_001')
    expect(result.externalId).toBe('story_001')
  })

  it('uses passed projectId over workspace_id', () => {
    const result = transformTask(raw, 'override-proj')
    expect(result.projectId).toBe('override-proj')
  })

  it('falls back to workspace_id when no projectId arg', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('ws_12345')
  })

  it('maps title from name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('User authentication')
  })

  it('maps description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Implement OAuth2 login flow.')
  })

  it('status is in_progress for "in_progress"', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status is closed for "resolved"', () => {
    const result = transformTask({ ...raw, status: 'resolved' })
    expect(result.status).toBe('closed')
  })

  it('status is closed for "rejected"', () => {
    const result = transformTask({ ...raw, status: 'rejected' })
    expect(result.status).toBe('closed')
  })

  it('status is in_progress for "developing"', () => {
    const result = transformTask({ ...raw, status: 'developing' })
    expect(result.status).toBe('in_progress')
  })

  it('status is open for "planning"', () => {
    const result = transformTask({ ...raw, status: 'planning' })
    expect(result.status).toBe('open')
  })

  it('priority is high for priority_label "High"', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority is medium for priority_label "Middle"', () => {
    const result = transformTask({ ...raw, priority_label: 'Middle' })
    expect(result.priority).toBe('medium')
  })

  it('priority is low for priority_label "Nice To Have"', () => {
    const result = transformTask({ ...raw, priority_label: 'Nice To Have' })
    expect(result.priority).toBe('low')
  })

  it('priority is low for priority_label "Low"', () => {
    const result = transformTask({ ...raw, priority_label: 'Low' })
    expect(result.priority).toBe('low')
  })

  it('priority is undefined when priority_label and priority are absent', () => {
    const result = transformTask({ id: 'x', priority_label: '', priority: '' })
    expect(result.priority).toBeUndefined()
  })

  it('maps multiple assignees from semicolon-separated owner', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['alice', 'bob'])
  })

  it('assigneeIds is empty when owner is absent', () => {
    const result = transformTask({ id: 'x' })
    expect(result.assigneeIds).toEqual([])
  })

  it('generates tagIds from label field (comma-separated)', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['ws_12345:label:backend', 'ws_12345:label:security'])
  })

  it('tagIds is empty when label is absent', () => {
    const result = transformTask({ id: 'x', workspace_id: 'ws' })
    expect(result.tagIds).toEqual([])
  })

  it('parentId is undefined when parent_id is "0"', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('maps parentId when parent_id is a real id', () => {
    const result = transformTask({ ...raw, parent_id: 'story_parent' })
    expect(result.parentId).toBe('story_parent')
  })

  it('metadata contains iterationId', () => {
    const result = transformTask(raw)
    expect(result.metadata.iterationId).toBe('iter_01')
  })

  it('platform is tapd', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('tapd')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
