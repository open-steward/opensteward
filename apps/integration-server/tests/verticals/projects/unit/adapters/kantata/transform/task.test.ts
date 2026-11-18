import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawKantataStory,
} from '../../../../../../../src/verticals/projects/adapters/kantata/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('kantata transformTask', () => {
  const raw: RawKantataStory = {
    id: 'story-456',
    title: 'Design mockups',
    description: 'Create high-fidelity mockups',
    story_type: 'task',
    state: 'started',
    status: 'In Progress',
    priority: 2,
    percentage_complete: 40,
    due_date: '2024-08-15T00:00:00.000Z',
    start_date: '2024-07-01T00:00:00.000Z',
    archived: false,
    parent_id: null,
    workspace_id: 'ws-123',
    assignee_ids: ['usr-1', 'usr-2'],
    tag_ids: ['tag-10', 'tag-20'],
    sub_story_count: 3,
    created_at: '2024-07-01T09:00:00.000Z',
    updated_at: '2024-07-15T12:00:00.000Z',
  }

  it('maps id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('story-456')
    expect(result.externalId).toBe('story-456')
  })

  it('maps title', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Design mockups')
  })

  it('maps projectId from workspace_id', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('ws-123')
  })

  it('overrides projectId with explicit argument', () => {
    const result = transformTask(raw, 'ws-override')
    expect(result.projectId).toBe('ws-override')
  })

  it('status is in_progress for state=started', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('in_progress')
  })

  it('status is closed for state=completed', () => {
    const result = transformTask({ ...raw, state: 'completed' })
    expect(result.status).toBe('closed')
  })

  it('status is blocked for state=blocked', () => {
    const result = transformTask({ ...raw, state: 'blocked' })
    expect(result.status).toBe('blocked')
  })

  it('status is closed when archived=true', () => {
    const result = transformTask({ ...raw, archived: true })
    expect(result.status).toBe('closed')
  })

  it('priority=2 maps to high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority=3 maps to urgent', () => {
    const result = transformTask({ ...raw, priority: 3 })
    expect(result.priority).toBe('urgent')
  })

  it('priority=1 maps to medium', () => {
    const result = transformTask({ ...raw, priority: 1 })
    expect(result.priority).toBe('medium')
  })

  it('priority=0 maps to low', () => {
    const result = transformTask({ ...raw, priority: 0 })
    expect(result.priority).toBe('low')
  })

  it('maps assigneeIds from assignee_ids', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['usr-1', 'usr-2'])
  })

  it('maps tagIds from tag_ids', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['tag-10', 'tag-20'])
  })

  it('maps subtaskCount from sub_story_count', () => {
    const result = transformTask(raw)
    expect(result.subtaskCount).toBe(3)
  })

  it('parentId is undefined when parent_id is null', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('maps parentId when parent_id is set', () => {
    const result = transformTask({ ...raw, parent_id: 'story-100' })
    expect(result.parentId).toBe('story-100')
  })

  it('maps dueDate to ISO string', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-08-15T00:00:00.000Z')
  })

  it('platform is kantata', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('kantata')
  })

  it('metadata contains storyType and state', () => {
    const result = transformTask(raw)
    expect(result.metadata.storyType).toBe('task')
    expect(result.metadata.state).toBe('started')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
