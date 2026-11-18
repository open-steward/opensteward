import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawBusinessmapCard,
} from '../../../../../../../src/verticals/projects/adapters/businessmap/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('businessmap transformTask', () => {
  const raw: RawBusinessmapCard = {
    card_id: 300,
    board_id: 42,
    workflow_id: 1,
    column_id: 5,
    lane_id: 2,
    title: 'Fix login bug',
    description: 'Users cannot log in on Safari.',
    priority: 3,
    deadline: '2024-04-01T00:00:00.000Z',
    is_archived: 0,
    is_discarded: 0,
    owner_user_id: 77,
    custom_id: 'BUG-42',
    created_at: '2024-01-15T09:00:00.000Z',
    last_modified: '2024-02-10T14:30:00.000Z',
  }

  it('maps id and externalId from card_id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('300')
    expect(result.externalId).toBe('300')
  })

  it('maps projectId from board_id when no arg given', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('42')
  })

  it('caller-supplied boardId overrides board_id', () => {
    const result = transformTask(raw, 'board-override')
    expect(result.projectId).toBe('board-override')
  })

  it('maps title', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Fix login bug')
  })

  it('maps description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Users cannot log in on Safari.')
  })

  it('status is open when not discarded or archived', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when is_discarded is 1', () => {
    const result = transformTask({ ...raw, is_discarded: 1 })
    expect(result.status).toBe('closed')
  })

  it('status is closed when is_archived is 1', () => {
    const result = transformTask({ ...raw, is_archived: 1 })
    expect(result.status).toBe('closed')
  })

  it('priority 3 maps to high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority 4 maps to urgent', () => {
    const result = transformTask({ ...raw, priority: 4 })
    expect(result.priority).toBe('urgent')
  })

  it('priority 2 maps to medium', () => {
    const result = transformTask({ ...raw, priority: 2 })
    expect(result.priority).toBe('medium')
  })

  it('priority 1 maps to low', () => {
    const result = transformTask({ ...raw, priority: 1 })
    expect(result.priority).toBe('low')
  })

  it('priority 0 maps to undefined', () => {
    const result = transformTask({ ...raw, priority: 0 })
    expect(result.priority).toBeUndefined()
  })

  it('assigneeIds contains owner_user_id', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['77'])
  })

  it('assigneeIds is empty when owner_user_id is null', () => {
    const result = transformTask({ ...raw, owner_user_id: null })
    expect(result.assigneeIds).toEqual([])
  })

  it('dueDate is ISO datetime from deadline', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-04-01T00:00:00.000Z')
  })

  it('createdAt parses ISO datetime from created_at', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2024-01-15T09:00:00.000Z')
  })

  it('updatedAt parses ISO datetime from last_modified', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBe('2024-02-10T14:30:00.000Z')
  })

  it('tagIds is always empty (separate call required)', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('parentId is always undefined (requires /cards/{id}/parents call)', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('metadata.customId reflects custom_id', () => {
    const result = transformTask(raw)
    expect(result.metadata.customId).toBe('BUG-42')
  })

  it('platform is businessmap', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('businessmap')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
