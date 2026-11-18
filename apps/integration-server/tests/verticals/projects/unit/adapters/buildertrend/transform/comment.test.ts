import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawBuildertrendComment,
} from '../../../../../../../src/verticals/projects/adapters/buildertrend/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('buildertrend transformComment', () => {
  const raw: RawBuildertrendComment = {
    id: 700,
    text: 'Great work on the framing!',
    createdByUserId: 55,
    todoId: 300,
    jobId: 200,
    attachmentCount: 2,
    createdDate: '2025-05-01T14:00:00.000Z',
    modifiedDate: '2025-05-02T09:00:00.000Z',
  }

  it('maps id from id field', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('700')
  })

  it('maps body from text', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Great work on the framing!')
  })

  it('maps body from body field when text absent', () => {
    const result = transformComment({ ...raw, text: undefined, body: 'via body field' })
    expect(result.body).toBe('via body field')
  })

  it('maps body from comment field as final fallback', () => {
    const result = transformComment({
      ...raw,
      text: undefined,
      body: undefined,
      comment: 'via comment field',
    })
    expect(result.body).toBe('via comment field')
  })

  it('authorId from createdByUserId', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('55')
  })

  it('authorId from createdByUser.id when createdByUserId absent', () => {
    const result = transformComment({
      ...raw,
      createdByUserId: undefined,
      createdByUser: { id: 88 },
    })
    expect(result.authorId).toBe('88')
  })

  it('taskId from todoId when no explicit arg', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('300')
  })

  it('explicit taskId arg takes precedence', () => {
    const result = transformComment(raw, 'task_override')
    expect(result.taskId).toBe('task_override')
  })

  it('projectId from jobId when no explicit arg', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('200')
  })

  it('attachmentCount from numeric field', () => {
    const result = transformComment(raw)
    expect(result.attachmentCount).toBe(2)
  })

  it('attachmentCount from attachments array length when count absent', () => {
    const result = transformComment({ ...raw, attachmentCount: undefined, attachments: [{}, {}] })
    expect(result.attachmentCount).toBe(2)
  })

  it('createdAt maps to ISO string', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2025-05-01T14:00:00.000Z')
  })

  it('falls back to epoch when createdDate absent', () => {
    const result = transformComment({ ...raw, createdDate: undefined })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('updatedAt maps from modifiedDate', () => {
    const result = transformComment(raw)
    expect(result.updatedAt).toBe('2025-05-02T09:00:00.000Z')
  })

  it('platform is buildertrend', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('buildertrend')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
