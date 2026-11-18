import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawWeekdoneComment,
} from '../../../../../../../src/verticals/projects/adapters/weekdone/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('weekdone transformComment', () => {
  const raw: RawWeekdoneComment = {
    id: 42,
    comment: 'Great progress this week!',
    user_id: 7,
    inserted: '2026-01-15T09:30:00.000Z',
    updated: '2026-01-16T10:00:00.000Z',
  }

  it('id is composite {taskId}:{commentId} when taskId is provided', () => {
    const result = transformComment(raw, 'task-99')
    expect(result.id).toBe('task-99:42')
  })

  it('id is bare commentId when no taskId is provided', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('42')
  })

  it('externalId is always the bare comment id', () => {
    const result = transformComment(raw, 'task-99')
    expect(result.externalId).toBe('42')
  })

  it('taskId is set from the provided argument', () => {
    const result = transformComment(raw, 'task-99')
    expect(result.taskId).toBe('task-99')
  })

  it('taskId is undefined when not provided', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBeUndefined()
  })

  it('authorId is derived from user_id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('7')
  })

  it('authorId is empty string when user_id is absent', () => {
    const result = transformComment({ ...raw, user_id: undefined })
    expect(result.authorId).toBe('')
  })

  it('body maps from comment field', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Great progress this week!')
  })

  it('body is empty string when comment is absent', () => {
    const result = transformComment({ id: 5 })
    expect(result.body).toBe('')
  })

  it('createdAt is converted to ISO from inserted', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe(new Date('2026-01-15T09:30:00.000Z').toISOString())
  })

  it('createdAt falls back to epoch when inserted is absent', () => {
    const result = transformComment({ id: 5 })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('mentions is always an empty array', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual([])
  })

  it('attachmentCount is 0', () => {
    const result = transformComment(raw)
    expect(result.attachmentCount).toBe(0)
  })

  it('platform is weekdone', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('weekdone')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'task-99')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('passes CommentSchema.parse without taskId', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
