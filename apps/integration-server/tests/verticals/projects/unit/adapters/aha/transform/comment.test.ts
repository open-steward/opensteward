import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawAhaComment,
} from '../../../../../../../src/verticals/projects/adapters/aha/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('aha transformComment', () => {
  const raw: RawAhaComment = {
    id: 'cmt-123',
    body: 'This feature looks great.',
    created_at: '2024-03-10T12:00:00Z',
    updated_at: '2024-03-11T09:00:00Z',
    user: { id: 'usr-9', name: 'Alice', email: 'alice@acme.example' },
    attachments: [{}],
  }

  it('maps id and externalId', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('cmt-123')
    expect(result.externalId).toBe('cmt-123')
  })

  it('maps authorId from user.id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('usr-9')
  })

  it('authorId is empty string when user is absent', () => {
    const result = transformComment({ ...raw, user: undefined })
    expect(result.authorId).toBe('')
  })

  it('maps body', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('This feature looks great.')
  })

  it('taskId comes from caller argument', () => {
    const result = transformComment(raw, 'feat-42')
    expect(result.taskId).toBe('feat-42')
  })

  it('taskId is undefined when not provided', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBeUndefined()
  })

  it('attachmentCount reflects attachments array length', () => {
    const result = transformComment(raw)
    expect(result.attachmentCount).toBe(1)
  })

  it('createdAt maps ISO string directly', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-03-10T12:00:00.000Z')
  })

  it('updatedAt maps ISO string', () => {
    const result = transformComment(raw)
    expect(result.updatedAt).toBe('2024-03-11T09:00:00.000Z')
  })

  it('platform is aha', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('aha')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'feat-42')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('createdAt falls back to epoch-0 when created_at is absent', () => {
    const result = transformComment({ id: 'x', body: 'hi' })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })
})
