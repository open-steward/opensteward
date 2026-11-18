import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawProjectManagerComment,
} from '../../../../../../../src/verticals/projects/adapters/projectmanager/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('projectmanager transformComment', () => {
  const raw: RawProjectManagerComment = {
    id: 'cmt-uuid-1',
    text: 'Reviewed and approved.',
    authorId: 'user-uuid-9',
    authorName: 'Carol Engineer',
    createDate: '2025-03-01T09:00:00.000Z',
    modifyDate: '2025-03-02T11:30:00.000Z',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('cmt-uuid-1')
    expect(result.externalId).toBe('cmt-uuid-1')
  })

  it('maps body from text field', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Reviewed and approved.')
  })

  it('maps authorId correctly', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('user-uuid-9')
  })

  it('taskId comes from argument', () => {
    const result = transformComment(raw, 'task-123')
    expect(result.taskId).toBe('task-123')
  })

  it('taskId is undefined when not passed', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBeUndefined()
  })

  it('createdAt is ISO 8601', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2025-03-01T09:00:00.000Z')
  })

  it('platform is projectmanager', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('projectmanager')
  })

  it('metadata includes authorName', () => {
    const result = transformComment(raw)
    expect(result.metadata.authorName).toBe('Carol Engineer')
  })

  it('body is empty string when text is null', () => {
    const nullText: RawProjectManagerComment = { id: 'cmt-2', text: null }
    const result = transformComment(nullText)
    expect(result.body).toBe('')
  })

  it('authorId is empty string when authorId is null', () => {
    const nullAuthor: RawProjectManagerComment = { id: 'cmt-3', authorId: null }
    const result = transformComment(nullAuthor)
    expect(result.authorId).toBe('')
  })

  it('createdAt falls back to epoch when createDate is absent', () => {
    const minimal: RawProjectManagerComment = { id: 'cmt-4' }
    const result = transformComment(minimal)
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'task-abc')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
