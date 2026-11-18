import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawYandexTrackerComment,
} from '../../../../../../../src/verticals/projects/adapters/yandex-tracker/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('yandex-tracker transformComment', () => {
  const raw: RawYandexTrackerComment = {
    id: 123,
    longId: 'long-comment-abc',
    text: 'This is a comment body.',
    createdBy: { id: 'user-7', display: 'Alice' },
    updatedBy: { id: 'user-8', display: 'Bob' },
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-02-01T14:00:00.000Z',
    type: 'standard',
    transport: 'internal',
  }

  it('uses longId as id when present', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('long-comment-abc')
    expect(result.externalId).toBe('long-comment-abc')
  })

  it('falls back to string of numeric id when longId absent', () => {
    const result = transformComment({ ...raw, longId: undefined })
    expect(result.id).toBe('123')
  })

  it('maps body from text', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('This is a comment body.')
  })

  it('body is empty string when text absent', () => {
    const result = transformComment({ ...raw, text: undefined })
    expect(result.body).toBe('')
  })

  it('maps authorId from createdBy.id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('user-7')
  })

  it('authorId is empty string when createdBy absent', () => {
    const result = transformComment({ ...raw, createdBy: undefined })
    expect(result.authorId).toBe('')
  })

  it('maps taskId and projectId from arguments', () => {
    const result = transformComment(raw, 'task-1', 'proj-2')
    expect(result.taskId).toBe('task-1')
    expect(result.projectId).toBe('proj-2')
  })

  it('taskId and projectId are undefined when not passed', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBeUndefined()
    expect(result.projectId).toBeUndefined()
  })

  it('maps createdAt from raw', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('createdAt falls back to epoch when absent', () => {
    const result = transformComment({ ...raw, createdAt: undefined })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('maps updatedAt from raw', () => {
    const result = transformComment(raw)
    expect(result.updatedAt).toBe('2024-02-01T14:00:00.000Z')
  })

  it('platform is yandex-tracker', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('yandex-tracker')
  })

  it('metadata includes type and transport', () => {
    const result = transformComment(raw)
    expect(result.metadata.type).toBe('standard')
    expect(result.metadata.transport).toBe('internal')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'task-1', 'proj-2')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
