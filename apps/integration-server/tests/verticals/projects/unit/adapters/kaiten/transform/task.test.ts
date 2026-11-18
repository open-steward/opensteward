import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawKaitenCard,
} from '../../../../../../../src/verticals/projects/adapters/kaiten/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('kaiten transformTask', () => {
  const raw: RawKaitenCard = {
    id: 42,
    title: 'Fix login bug',
    description: 'Login fails on mobile',
    state: 2,
    board_id: 101,
    column_id: 5,
    lane_id: 3,
    owner_id: 10,
    members: [{ id: 10 }, { id: 20 }],
    tags: [{ id: 100 }, { id: 200 }],
    due_date: '2024-07-01T00:00:00.000Z',
    planned_start: '2024-06-01T00:00:00.000Z',
    planned_end: '2024-06-30T00:00:00.000Z',
    parents_ids: [5],
    children_count: 3,
    created: '2024-05-01T09:00:00.000Z',
    updated: '2024-06-15T12:00:00.000Z',
  }

  it('maps id as string', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps title correctly', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Fix login bug')
  })

  it('maps projectId from board_id', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('101')
  })

  it('overrides projectId with explicit boardId argument', () => {
    const result = transformTask(raw, 'board-999')
    expect(result.projectId).toBe('board-999')
  })

  it('status is open for state 2', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed for state 3', () => {
    const result = transformTask({ ...raw, state: 3 })
    expect(result.status).toBe('closed')
  })

  it('collects assigneeIds: owner + deduped members', () => {
    const result = transformTask(raw)
    // owner_id=10, members=[10, 20] → deduped → ['10', '20']
    expect(result.assigneeIds).toEqual(['10', '20'])
  })

  it('maps tagIds from tags array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual(['100', '200'])
  })

  it('maps parentId from first parents_ids entry', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('5')
  })

  it('maps subtaskCount from children_count', () => {
    const result = transformTask(raw)
    expect(result.subtaskCount).toBe(3)
  })

  it('maps dueDate to ISO string', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-07-01T00:00:00.000Z')
  })

  it('maps createdAt and updatedAt to ISO strings', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2024-05-01T09:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-15T12:00:00.000Z')
  })

  it('priority is undefined (Kaiten has no native priority)', () => {
    const result = transformTask(raw)
    expect(result.priority).toBeUndefined()
  })

  it('platform is kaiten', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('kaiten')
  })

  it('metadata contains state, columnId, laneId, boardId', () => {
    const result = transformTask(raw)
    expect(result.metadata.state).toBe('2')
    expect(result.metadata.columnId).toBe('5')
    expect(result.metadata.laneId).toBe('3')
    expect(result.metadata.boardId).toBe('101')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('parentId is undefined when parents_ids is empty', () => {
    const result = transformTask({ ...raw, parents_ids: [] })
    expect(result.parentId).toBeUndefined()
  })
})
