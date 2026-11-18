import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawWekanComment,
} from '../../../../../../../src/verticals/projects/adapters/wekan/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('wekan transformComment', () => {
  const raw: RawWekanComment = {
    _id: 'cmt-1',
    text: 'Looks good!',
    boardId: 'board-42',
    cardId: 'card-7',
    userId: 'user-3',
    createdAt: '2024-01-15T10:00:00.000Z',
    modifiedAt: '2024-01-16T08:30:00.000Z',
  }

  it('maps id and externalId from _id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('cmt-1')
    expect(result.externalId).toBe('cmt-1')
  })

  it('maps body from text', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Looks good!')
  })

  it('maps authorId from userId', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('user-3')
  })

  it('maps taskId from cardId on raw', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('card-7')
  })

  it('explicit cardId param overrides raw.cardId', () => {
    const result = transformComment(raw, 'card-override')
    expect(result.taskId).toBe('card-override')
  })

  it('maps projectId from boardId on raw', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('board-42')
  })

  it('explicit boardId param overrides raw.boardId', () => {
    const result = transformComment(raw, undefined, 'board-override')
    expect(result.projectId).toBe('board-override')
  })

  it('createdAt is ISO from raw.createdAt', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('updatedAt is ISO from raw.modifiedAt', () => {
    const result = transformComment(raw)
    expect(result.updatedAt).toBe('2024-01-16T08:30:00.000Z')
  })

  it('platform is wekan', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('wekan')
  })

  it('mentions is always empty array', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual([])
  })

  it('falls back to epoch when createdAt is absent', () => {
    const result = transformComment({ ...raw, createdAt: undefined })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
