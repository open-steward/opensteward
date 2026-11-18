import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawBusinessmapComment,
} from '../../../../../../../src/verticals/projects/adapters/businessmap/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('businessmap transformComment', () => {
  const raw: RawBusinessmapComment = {
    comment_id: 101,
    author_id: 55,
    card_id: 200,
    board_id: 10,
    text: 'Looks good to me.',
    created_at: '2024-03-15T10:00:00.000Z',
    updated_at: '2024-03-15T11:00:00.000Z',
  }

  it('maps id and externalId from comment_id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps authorId from author_id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('55')
  })

  it('maps body from text', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Looks good to me.')
  })

  it('derives taskId from card_id when no arg given', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('200')
  })

  it('caller-supplied taskId overrides card_id', () => {
    const result = transformComment(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('derives projectId from board_id when no arg given', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('10')
  })

  it('caller-supplied projectId overrides board_id', () => {
    const result = transformComment(raw, undefined, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('createdAt is ISO datetime string', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-03-15T10:00:00.000Z')
  })

  it('platform is businessmap', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('businessmap')
  })

  it('mentions is empty array', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual([])
  })

  it('attachmentCount is 0', () => {
    const result = transformComment(raw)
    expect(result.attachmentCount).toBe(0)
  })

  it('falls back to epoch when created_at is absent', () => {
    const result = transformComment({ comment_id: 1 })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
