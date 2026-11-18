import { describe, it, expect } from 'vitest'
import {
  transformCard,
  type RawWekanCard,
} from '../../../../../../../src/verticals/projects/adapters/wekan/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('wekan transformCard', () => {
  const raw: RawWekanCard = {
    _id: 'card-55',
    title: 'Fix login bug',
    description: 'The login screen throws an error on submit',
    archived: false,
    listId: 'list-3',
    boardId: 'board-7',
    swimlaneId: 'swim-1',
    parentId: null,
    members: ['user-1', 'user-2'],
    assignees: ['user-2', 'user-3'],
    labelIds: ['label-a', 'label-b'],
    dueAt: '2024-02-28T23:59:00.000Z',
    createdAt: '2024-01-01T12:00:00.000Z',
    modifiedAt: '2024-01-15T09:00:00.000Z',
    color: 'green',
    type: 'cardType-defaultCardType',
  }

  it('maps id and externalId from _id', () => {
    const result = transformCard(raw)
    expect(result.id).toBe('card-55')
    expect(result.externalId).toBe('card-55')
  })

  it('maps title', () => {
    const result = transformCard(raw)
    expect(result.title).toBe('Fix login bug')
  })

  it('uses raw.boardId as projectId when no param', () => {
    const result = transformCard(raw)
    expect(result.projectId).toBe('board-7')
  })

  it('boardId param overrides raw.boardId', () => {
    const result = transformCard(raw, 'board-override')
    expect(result.projectId).toBe('board-override')
  })

  it('status is open when not archived', () => {
    const result = transformCard(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when archived', () => {
    const result = transformCard({ ...raw, archived: true })
    expect(result.status).toBe('closed')
  })

  it('deduplicates assigneeIds from members and assignees', () => {
    const result = transformCard(raw)
    // members=[user-1,user-2], assignees=[user-2,user-3] → deduped [user-1,user-2,user-3]
    expect(result.assigneeIds).toEqual(['user-1', 'user-2', 'user-3'])
  })

  it('maps tagIds from labelIds', () => {
    const result = transformCard(raw)
    expect(result.tagIds).toEqual(['label-a', 'label-b'])
  })

  it('dueDate comes from dueAt', () => {
    const result = transformCard(raw)
    expect(result.dueDate).toBe('2024-02-28T23:59:00.000Z')
  })

  it('dueDate falls back to endAt when dueAt absent', () => {
    const result = transformCard({ ...raw, dueAt: null, endAt: '2024-03-01T00:00:00.000Z' })
    expect(result.dueDate).toBe('2024-03-01T00:00:00.000Z')
  })

  it('updatedAt comes from modifiedAt', () => {
    const result = transformCard(raw)
    expect(result.updatedAt).toBe('2024-01-15T09:00:00.000Z')
  })

  it('parentId is undefined when parentId is null', () => {
    const result = transformCard(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('platform is wekan', () => {
    const result = transformCard(raw)
    expect(result.platform).toBe('wekan')
  })

  it('metadata contains listId, swimlaneId, color, type', () => {
    const result = transformCard(raw)
    expect(result.metadata.listId).toBe('list-3')
    expect(result.metadata.swimlaneId).toBe('swim-1')
    expect(result.metadata.color).toBe('green')
    expect(result.metadata.type).toBe('cardType-defaultCardType')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformCard(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
