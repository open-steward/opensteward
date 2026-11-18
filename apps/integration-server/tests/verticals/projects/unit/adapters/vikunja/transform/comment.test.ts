import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawVikunjaTaskComment,
} from '../../../../../../../src/verticals/projects/adapters/vikunja/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('vikunja transformComment', () => {
  const raw: RawVikunjaTaskComment = {
    id: 42,
    comment: 'Looks good!',
    author: {
      id: 7,
      username: 'jdoe',
      name: 'Jane Doe',
      email: 'jane@example.com',
    },
    created: '2024-03-01T10:00:00.000Z',
    updated: '2024-03-02T12:00:00.000Z',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps body from comment field', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Looks good!')
  })

  it('maps authorId from author.id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('7')
  })

  it('maps taskId from caller argument', () => {
    const result = transformComment(raw, 'task-99')
    expect(result.taskId).toBe('task-99')
  })

  it('taskId is undefined when no taskId argument supplied', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBeUndefined()
  })

  it('maps createdAt to ISO string', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-03-01T10:00:00.000Z')
  })

  it('maps updatedAt to ISO string', () => {
    const result = transformComment(raw)
    expect(result.updatedAt).toBe('2024-03-02T12:00:00.000Z')
  })

  it('platform is vikunja', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('vikunja')
  })

  it('metadata contains authorUsername', () => {
    const result = transformComment(raw)
    expect(result.metadata.authorUsername).toBe('jdoe')
  })

  it('authorId is empty string when author has no id', () => {
    const r: RawVikunjaTaskComment = {
      id: 1,
      author: { username: 'nobody' },
    }
    const result = transformComment(r)
    expect(result.authorId).toBe('')
  })

  it('body is empty string when comment is absent', () => {
    const r: RawVikunjaTaskComment = { id: 2 }
    const result = transformComment(r)
    expect(result.body).toBe('')
  })

  it('createdAt falls back to epoch when created is absent', () => {
    const r: RawVikunjaTaskComment = { id: 3 }
    const result = transformComment(r)
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'task-42')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
