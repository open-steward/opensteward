import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawPlanfixComment,
} from '../../../../../../../src/verticals/projects/adapters/planfix/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('planfix transformComment', () => {
  const raw: RawPlanfixComment = {
    id: 77,
    dateTime: { datetime: '2026-01-20T10:00:00.000Z' },
    type: 'comment',
    fromType: 'user',
    description: 'Looks good to me!',
    task: { id: 55 },
    project: { id: 10 },
    owner: { id: 'user:3', name: 'Jane' },
    recipients: { users: [{ id: 'user:9', name: 'Alice' }] },
    files: [{}, {}],
    isDeleted: false,
  }

  it('maps id and externalId to string of numeric id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('77')
    expect(result.externalId).toBe('77')
  })

  it('body from raw.description', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Looks good to me!')
  })

  it('authorId from owner.id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('user:3')
  })

  it('authorId defaults to empty string when owner absent', () => {
    const result = transformComment({ ...raw, owner: undefined })
    expect(result.authorId).toBe('')
  })

  it('taskId resolved from raw.task.id when no arg given', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('55')
  })

  it('taskId uses explicit arg over raw.task.id', () => {
    const result = transformComment(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('projectId resolved from raw.project.id when no arg given', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('10')
  })

  it('projectId uses explicit arg over raw.project.id', () => {
    const result = transformComment(raw, undefined, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('mentions from recipients.users ids', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual(['user:9'])
  })

  it('attachmentCount from files array length', () => {
    const result = transformComment(raw)
    expect(result.attachmentCount).toBe(2)
  })

  it('attachmentCount is 0 when files absent', () => {
    const result = transformComment({ ...raw, files: undefined })
    expect(result.attachmentCount).toBe(0)
  })

  it('createdAt from dateTime timepoint', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2026-01-20T10:00:00.000Z')
  })

  it('createdAt falls back to epoch when dateTime absent', () => {
    const result = transformComment({ ...raw, dateTime: undefined })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('metadata.type from raw.type', () => {
    const result = transformComment(raw)
    expect(result.metadata.type).toBe('comment')
  })

  it('metadata.fromType from raw.fromType', () => {
    const result = transformComment(raw)
    expect(result.metadata.fromType).toBe('user')
  })

  it('platform is planfix', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('planfix')
  })

  it('raw is preserved on output', () => {
    const result = transformComment(raw)
    expect(result.raw).toBe(raw)
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
