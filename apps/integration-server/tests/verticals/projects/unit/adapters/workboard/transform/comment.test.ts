import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawWorkboardComment,
} from '../../../../../../../src/verticals/projects/adapters/workboard/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('workboard transformComment', () => {
  const raw: RawWorkboardComment = {
    comment_id: 77,
    body: 'Looks great!',
    author_id: 3,
    goal_id: 10,
    metric_id: 20,
    created_date: '2024-05-01T08:00:00.000Z',
  }

  it('maps id and externalId from comment_id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('77')
    expect(result.externalId).toBe('77')
  })

  it('falls back id to raw.id when comment_id absent', () => {
    const result = transformComment({ id: 99, body: 'hi' })
    expect(result.id).toBe('99')
  })

  it('maps body', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Looks great!')
  })

  it('maps authorId from author_id as string', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('3')
  })

  it('falls back authorId to user_id when author_id absent', () => {
    const result = transformComment({ ...raw, author_id: undefined, user_id: 55 })
    expect(result.authorId).toBe('55')
  })

  it('maps taskId from metric_id when no param', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('20')
  })

  it('explicit taskId param overrides metric_id', () => {
    const result = transformComment(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('maps projectId from goal_id when no param', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('10')
  })

  it('explicit projectId param overrides goal_id', () => {
    const result = transformComment(raw, undefined, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('maps createdAt from created_date', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-05-01T08:00:00.000Z')
  })

  it('falls back createdAt to created_at', () => {
    const result = transformComment({
      ...raw,
      created_date: undefined,
      created_at: '2024-06-01T00:00:00.000Z',
    })
    expect(result.createdAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('falls back to epoch when no date present', () => {
    const result = transformComment({ comment_id: 1 })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('platform is workboard', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('workboard')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
