import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawSpacesComment,
} from '../../../../../../../src/verticals/projects/adapters/teamwork-desk/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('teamwork-desk transformComment', () => {
  const raw: RawSpacesComment = {
    id: 101,
    content: 'Great work on this page!',
    identifier: 'cmt-abc',
    isPrivate: false,
    parentId: null,
    state: 'active',
    createdAt: '2024-03-01T10:00:00.000Z',
    updatedAt: '2024-03-02T08:00:00.000Z',
    createdBy: { id: 55 },
    page: { id: 200 },
    space: { id: 300 },
  }

  it('maps id and externalId from raw.id as string', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps body from content', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Great work on this page!')
  })

  it('authorId from createdBy.id as string', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('55')
  })

  it('taskId is the composite Task.id built from the caller-supplied page and space', () => {
    const result = transformComment(raw, 'page-override', 'space-override')
    expect(result.taskId).toBe('space-override:page-override')
  })

  it('taskId falls back to the composite of raw.space.id and raw.page.id', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('300:200')
  })

  it('taskId is omitted when either half of the composite id is unknown', () => {
    expect(transformComment({ ...raw, space: null }).taskId).toBeUndefined()
    expect(transformComment({ ...raw, page: null }).taskId).toBeUndefined()
  })

  it('projectId uses caller-supplied spaceId arg', () => {
    const result = transformComment(raw, undefined, 'space-override')
    expect(result.projectId).toBe('space-override')
  })

  it('projectId falls back to raw.space.id', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('300')
  })

  it('createdAt is ISO string from raw.createdAt', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe(new Date('2024-03-01T10:00:00.000Z').toISOString())
  })

  it('createdAt defaults to epoch when createdAt is absent', () => {
    const result = transformComment({ id: 1 })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('platform is teamwork-desk', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('teamwork-desk')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
