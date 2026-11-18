import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawTaigaComment,
} from '../../../../../../../src/verticals/projects/adapters/taiga/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('taiga transformComment', () => {
  const raw: RawTaigaComment = {
    id: 'abc-uuid-001',
    user: { pk: 5, username: 'alice' },
    created_at: '2026-02-20T14:30:00.000Z',
    comment: 'LGTM! Ready to merge.',
    comment_html: '<p>LGTM! Ready to merge.</p>',
    delete_comment_date: null,
  }

  it('maps id and externalId from string id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('abc-uuid-001')
    expect(result.externalId).toBe('abc-uuid-001')
  })

  it('maps authorId from user.pk', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('5')
  })

  it('maps body from comment field', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('LGTM! Ready to merge.')
  })

  it('maps createdAt from created_at', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2026-02-20T14:30:00.000Z')
  })

  it('falls back to epoch when created_at is absent', () => {
    const result = transformComment({ id: 'x', user: null })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('passes taskId and projectId through from args', () => {
    const result = transformComment(raw, 'task-301', 'proj-88')
    expect(result.taskId).toBe('task-301')
    expect(result.projectId).toBe('proj-88')
  })

  it('taskId is undefined when not passed', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBeUndefined()
  })

  it('metadata.commentHtml contains the html body', () => {
    const result = transformComment(raw)
    expect(result.metadata.commentHtml).toBe('<p>LGTM! Ready to merge.</p>')
  })

  it('metadata.deleted is set when delete_comment_date is non-null', () => {
    const result = transformComment({ ...raw, delete_comment_date: '2026-03-01T00:00:00.000Z' })
    expect(result.metadata.deleted).toBe('true')
  })

  it('metadata.deleted is absent when delete_comment_date is null', () => {
    const result = transformComment(raw)
    expect(result.metadata.deleted).toBeUndefined()
  })

  it('platform is taiga', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('taiga')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'task-301', 'proj-88')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
