import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawGanttproComment,
} from '../../../../../../../src/verticals/projects/adapters/ganttpro/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

const rawComment: RawGanttproComment = {
  id: 101,
  taskId: 55,
  projectId: 42,
  userId: 99,
  content: 'This is a comment body.',
  createdAt: '2026-05-10T08:00:00Z',
  updatedAt: '2026-05-11T09:00:00Z',
}

describe('transformComment', () => {
  it('maps id to id as a string', () => {
    const result = transformComment(rawComment)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps content to body', () => {
    const result = transformComment(rawComment)
    expect(result.body).toBe('This is a comment body.')
  })

  it('maps userId to authorId when userId is present', () => {
    const result = transformComment(rawComment)
    expect(result.authorId).toBe('99')
  })

  it('falls back to user.resourceId for authorId when userId is absent', () => {
    const raw: RawGanttproComment = {
      id: 102,
      user: { resourceId: 77 },
      content: 'Nested user comment',
      createdAt: '2026-05-10T08:00:00Z',
    }
    const result = transformComment(raw)
    expect(result.authorId).toBe('77')
  })

  it('taskId param overrides raw taskId', () => {
    const result = transformComment(rawComment, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('projectId param overrides raw projectId', () => {
    const result = transformComment(rawComment, undefined, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('falls back to raw taskId when param not provided', () => {
    const result = transformComment(rawComment)
    expect(result.taskId).toBe('55')
  })

  it('maps createdAt to ISO string', () => {
    const result = transformComment(rawComment)
    expect(result.createdAt).toBe('2026-05-10T08:00:00.000Z')
  })

  it('maps updatedAt to ISO string', () => {
    const result = transformComment(rawComment)
    expect(result.updatedAt).toBe('2026-05-11T09:00:00.000Z')
  })

  it('sets platform to "ganttpro"', () => {
    const result = transformComment(rawComment)
    expect(result.platform).toBe('ganttpro')
  })

  it('passes schema validation', () => {
    const result = transformComment(rawComment)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('uses epoch as createdAt when absent', () => {
    const raw: RawGanttproComment = { id: 103, userId: 1, content: 'no date' }
    const result = transformComment(raw)
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })
})
