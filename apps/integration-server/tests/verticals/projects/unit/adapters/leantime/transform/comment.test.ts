import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawLeantimeComment,
} from '../../../../../../../src/verticals/projects/adapters/leantime/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('leantime transformComment', () => {
  const raw: RawLeantimeComment = {
    id: 33,
    text: 'Looks great, approved!',
    date: '2024-06-10T14:00:00.000Z',
    moduleId: 88,
    userId: 5,
    commentParent: 0,
    status: 'active',
  }

  it('maps id as string', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('33')
    expect(result.externalId).toBe('33')
  })

  it('maps body from text', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Looks great, approved!')
  })

  it('maps taskId from moduleId', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('88')
  })

  it('overrides taskId with explicit argument', () => {
    const result = transformComment(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('maps authorId from userId', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('5')
  })

  it('maps createdAt from date', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-06-10T14:00:00.000Z')
  })

  it('platform is leantime', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('leantime')
  })

  it('metadata contains commentParent and status', () => {
    const result = transformComment(raw)
    expect(result.metadata.commentParent).toBe('0')
    expect(result.metadata.status).toBe('active')
  })

  it('mentions is empty array', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual([])
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('createdAt falls back to epoch when date absent', () => {
    const result = transformComment({ id: 1 })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('authorId is empty string when userId absent', () => {
    const result = transformComment({ id: 1, date: '2024-01-01T00:00:00.000Z' })
    expect(result.authorId).toBe('')
  })
})
