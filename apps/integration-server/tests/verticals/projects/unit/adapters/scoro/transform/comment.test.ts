import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawScoroComment,
} from '../../../../../../../src/verticals/projects/adapters/scoro/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('scoro transformComment', () => {
  const raw: RawScoroComment = {
    comment_id: 42,
    comment: 'Please review the attached spec.',
    user_id: 7,
    parent_id: null,
    modified_date: '2026-03-10T14:00:00Z',
  }

  it('maps id and externalId from comment_id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps body from comment field', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Please review the attached spec.')
  })

  it('maps authorId from user_id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('7')
  })

  it('taskId and projectId come from params', () => {
    const result = transformComment(raw, 'task-1', 'proj-1')
    expect(result.taskId).toBe('task-1')
    expect(result.projectId).toBe('proj-1')
  })

  it('taskId and projectId are undefined when no params given', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBeUndefined()
    expect(result.projectId).toBeUndefined()
  })

  it('maps createdAt from modified_date', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2026-03-10T14:00:00.000Z')
  })

  it('createdAt falls back to epoch when modified_date is absent', () => {
    const result = transformComment({ comment_id: 1 })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('authorId is empty string when user_id is absent', () => {
    const result = transformComment({ comment_id: 1 })
    expect(result.authorId).toBe('')
  })

  it('body is empty string when comment is absent', () => {
    const result = transformComment({ comment_id: 1 })
    expect(result.body).toBe('')
  })

  it('stores parentId in metadata', () => {
    const result = transformComment({ ...raw, parent_id: 10 })
    expect(result.metadata.parentId).toBe('10')
  })

  it('platform is scoro', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('scoro')
  })

  it('mentions is an empty array', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual([])
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'task-1', 'proj-1')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
