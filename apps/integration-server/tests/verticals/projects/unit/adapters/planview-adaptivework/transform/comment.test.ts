import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawClarizenDiscussion,
} from '../../../../../../../src/verticals/projects/adapters/planview-adaptivework/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('planview-adaptivework transformComment', () => {
  const raw: RawClarizenDiscussion = {
    id: '/Discussion/disc-42',
    Text: 'This looks great!',
    CreatedBy: { id: '/User/usr-1', Name: 'Alice' },
    Container: { id: '/Task/task-99', Name: 'Build API endpoint' },
    CreatedOn: '2026-02-10T09:00:00.000Z',
    LastUpdatedOn: '2026-02-11T10:00:00.000Z',
  }

  it('maps id and externalId directly from raw.id URI', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('/Discussion/disc-42')
    expect(result.externalId).toBe('/Discussion/disc-42')
  })

  it('body from raw.Text', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('This looks great!')
  })

  it('body defaults to empty string when Text absent', () => {
    const result = transformComment({ ...raw, Text: undefined })
    expect(result.body).toBe('')
  })

  it('authorId from CreatedBy.id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('/User/usr-1')
  })

  it('authorId defaults to empty string when CreatedBy absent', () => {
    const result = transformComment({ ...raw, CreatedBy: undefined })
    expect(result.authorId).toBe('')
  })

  it('taskId resolved from Container.id when no arg given', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('/Task/task-99')
  })

  it('taskId uses explicit arg over Container', () => {
    const result = transformComment(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('projectId is not set (no projectId in this transform)', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBeUndefined()
  })

  it('mentions is empty array', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual([])
  })

  it('createdAt from CreatedOn', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2026-02-10T09:00:00.000Z')
  })

  it('createdAt falls back to epoch when CreatedOn absent', () => {
    const result = transformComment({ ...raw, CreatedOn: undefined })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('updatedAt from LastUpdatedOn', () => {
    const result = transformComment(raw)
    expect(result.updatedAt).toBe('2026-02-11T10:00:00.000Z')
  })

  it('metadata.authorName from CreatedBy.Name', () => {
    const result = transformComment(raw)
    expect(result.metadata.authorName).toBe('Alice')
  })

  it('metadata.containerName from Container.Name', () => {
    const result = transformComment(raw)
    expect(result.metadata.containerName).toBe('Build API endpoint')
  })

  it('platform is planview-adaptivework', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('planview-adaptivework')
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
