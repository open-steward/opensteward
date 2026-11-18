import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawLinearStory,
} from '../../../../../../../src/verticals/projects/adapters/wimi/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('wimi transformComment', () => {
  const raw: RawLinearStory = {
    gid: 'story-100',
    text: 'Added acceptance criteria.',
    resource_subtype: 'comment_added',
    created_by: { gid: 'user-5' },
    created_at: '2024-03-10T14:00:00.000Z',
    target: { gid: 'task-9', resource_type: 'task' },
  }

  it('maps id and externalId from gid', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('story-100')
    expect(result.externalId).toBe('story-100')
  })

  it('maps body from text', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Added acceptance criteria.')
  })

  it('maps authorId from created_by.gid', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('user-5')
  })

  it('resolves taskId from target when resource_type is task', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('task-9')
  })

  it('explicit taskId param overrides target resolution', () => {
    const result = transformComment(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('resolves projectId from target when resource_type is project', () => {
    const rawProject: RawLinearStory = {
      ...raw,
      target: { gid: 'proj-3', resource_type: 'project' },
    }
    const result = transformComment(rawProject)
    expect(result.projectId).toBe('proj-3')
    expect(result.taskId).toBeUndefined()
  })

  it('maps createdAt as ISO string', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-03-10T14:00:00.000Z')
  })

  it('platform is wimi', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('wimi')
  })

  it('metadata contains resourceSubtype', () => {
    const result = transformComment(raw)
    expect(result.metadata.resourceSubtype).toBe('comment_added')
  })

  it('falls back to epoch when created_at absent', () => {
    const result = transformComment({ ...raw, created_at: undefined })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
