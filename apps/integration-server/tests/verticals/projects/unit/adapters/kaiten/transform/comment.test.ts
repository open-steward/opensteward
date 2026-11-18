import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawKaitenComment,
} from '../../../../../../../src/verticals/projects/adapters/kaiten/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('kaiten transformComment', () => {
  const raw: RawKaitenComment = {
    id: 77,
    uid: 'abc-uid-123',
    text: 'Please review this.',
    type: 1,
    card_id: 42,
    author_id: 10,
    author: { id: 10, full_name: 'Alice', email: 'alice@example.com' },
    created: '2024-05-10T11:00:00.000Z',
    updated: '2024-05-10T11:05:00.000Z',
    internal: false,
    edited: false,
  }

  it('maps id as string', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('77')
    expect(result.externalId).toBe('77')
  })

  it('maps body from text', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Please review this.')
  })

  it('maps taskId from card_id', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('42')
  })

  it('overrides taskId with explicit argument', () => {
    const result = transformComment(raw, 'task-999')
    expect(result.taskId).toBe('task-999')
  })

  it('maps authorId from author_id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('10')
  })

  it('falls back to author.id when author_id is absent', () => {
    const result = transformComment({ ...raw, author_id: undefined })
    expect(result.authorId).toBe('10')
  })

  it('maps createdAt to ISO string', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-05-10T11:00:00.000Z')
  })

  it('platform is kaiten', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('kaiten')
  })

  it('metadata contains uid and type', () => {
    const result = transformComment(raw)
    expect(result.metadata.uid).toBe('abc-uid-123')
    expect(result.metadata.type).toBe('1')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('createdAt falls back to epoch when created is absent', () => {
    const result = transformComment({ id: 1 })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })
})
