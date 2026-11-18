import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawAirtableStory,
} from '../../../../../../../src/verticals/projects/adapters/zenkit/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('zenkit transformComment', () => {
  const raw: RawAirtableStory = {
    gid: 'story-gid-1',
    text: 'Looks good to me!',
    html_text: '<p>Looks good to me!</p>',
    type: 'comment',
    resource_subtype: 'comment',
    created_by: { gid: 'user-gid-1' },
    created_at: '2024-01-15T10:00:00.000Z',
    target: { gid: 'task-gid-1', resource_type: 'task' },
  }

  it('maps id and externalId from gid', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('story-gid-1')
    expect(result.externalId).toBe('story-gid-1')
  })

  it('maps body from text', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Looks good to me!')
  })

  it('body is empty string when text absent', () => {
    const result = transformComment({ ...raw, text: undefined })
    expect(result.body).toBe('')
  })

  it('maps authorId from created_by.gid', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('user-gid-1')
  })

  it('authorId is empty string when created_by absent', () => {
    const result = transformComment({ ...raw, created_by: undefined })
    expect(result.authorId).toBe('')
  })

  it('maps taskId from argument when provided', () => {
    const result = transformComment(raw, 'override-task')
    expect(result.taskId).toBe('override-task')
  })

  it('infers taskId from target when resource_type is task', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('task-gid-1')
  })

  it('taskId is undefined when target is project type', () => {
    const result = transformComment({ ...raw, target: { gid: 'proj-1', resource_type: 'project' } })
    expect(result.taskId).toBeUndefined()
  })

  it('maps projectId from argument when provided', () => {
    const result = transformComment(raw, undefined, 'override-proj')
    expect(result.projectId).toBe('override-proj')
  })

  it('infers projectId from target when resource_type is project', () => {
    const result = transformComment({
      ...raw,
      target: { gid: 'proj-gid-1', resource_type: 'project' },
    })
    expect(result.projectId).toBe('proj-gid-1')
  })

  it('maps createdAt', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('createdAt falls back to epoch when absent', () => {
    const result = transformComment({ ...raw, created_at: undefined })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('platform is zenkit', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('zenkit')
  })

  it('metadata includes resourceSubtype', () => {
    const result = transformComment(raw)
    expect(result.metadata.resourceSubtype).toBe('comment')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'task-gid-1', 'proj-gid-1')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
