import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawPlaneComment,
} from '../../../../../../../src/verticals/projects/adapters/plane/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('plane transformComment', () => {
  const raw: RawPlaneComment = {
    id: 'cmt-uuid-001',
    comment_html: '<p>Looks good to me.</p>',
    comment_stripped: 'Looks good to me.',
    actor: 'user-uuid-actor',
    created_by: 'user-uuid-creator',
    issue: 'issue-uuid-001',
    project: 'project-uuid-001',
    workspace: 'workspace-uuid-001',
    created_at: '2024-01-15T12:00:00.000Z',
    updated_at: '2024-01-16T08:30:00.000Z',
  }

  it('id and externalId map from raw.id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('cmt-uuid-001')
    expect(result.externalId).toBe('cmt-uuid-001')
  })

  it('body maps from comment_stripped', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Looks good to me.')
  })

  it('taskId comes from raw.issue when no arg given', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('issue-uuid-001')
  })

  it('caller-supplied taskId overrides raw.issue', () => {
    const result = transformComment(raw, 'override-task-id')
    expect(result.taskId).toBe('override-task-id')
  })

  it('projectId comes from raw.project when no arg given', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('project-uuid-001')
  })

  it('caller-supplied projectId overrides raw.project', () => {
    const result = transformComment(raw, undefined, 'override-project-id')
    expect(result.projectId).toBe('override-project-id')
  })

  it('authorId prefers actor over created_by', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('user-uuid-actor')
  })

  it('authorId falls back to created_by when actor is absent', () => {
    const result = transformComment({ ...raw, actor: undefined })
    expect(result.authorId).toBe('user-uuid-creator')
  })

  it('authorId is empty string when actor and created_by are absent', () => {
    const result = transformComment({ ...raw, actor: undefined, created_by: undefined })
    expect(result.authorId).toBe('')
  })

  it('mentions is an empty array', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual([])
  })

  it('attachmentCount is 0', () => {
    const result = transformComment(raw)
    expect(result.attachmentCount).toBe(0)
  })

  it('metadata is an empty record', () => {
    const result = transformComment(raw)
    expect(result.metadata).toEqual({})
  })

  it('platform is plane', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('plane')
  })

  it('createdAt is an ISO string', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-01-15T12:00:00.000Z')
  })

  it('updatedAt is an ISO string', () => {
    const result = transformComment(raw)
    expect(result.updatedAt).toBe('2024-01-16T08:30:00.000Z')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('createdAt falls back to epoch when created_at is absent', () => {
    const result = transformComment({ ...raw, created_at: undefined } as any)
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })
})
