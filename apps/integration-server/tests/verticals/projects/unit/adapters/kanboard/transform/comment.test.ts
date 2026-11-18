import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawKanboardComment,
} from '../../../../../../../src/verticals/projects/adapters/kanboard/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('kanboard transformComment', () => {
  const raw: RawKanboardComment = {
    id: '55',
    task_id: '88',
    user_id: '5',
    date_creation: '1690000000',
    comment: 'LGTM, merging now.',
    username: 'bob',
    name: 'Bob Builder',
  }

  it('maps id as string', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('maps body from comment field', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('LGTM, merging now.')
  })

  it('maps taskId from task_id', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('88')
  })

  it('overrides taskId with explicit argument', () => {
    const result = transformComment(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('maps authorId from user_id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('5')
  })

  it('platform is kanboard', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('kanboard')
  })

  it('metadata contains username and authorName', () => {
    const result = transformComment(raw)
    expect(result.metadata.username).toBe('bob')
    expect(result.metadata.authorName).toBe('Bob Builder')
  })

  it('mentions is empty array', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual([])
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('createdAt falls back to epoch when date_creation absent', () => {
    const result = transformComment({ id: '1' })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })
})
