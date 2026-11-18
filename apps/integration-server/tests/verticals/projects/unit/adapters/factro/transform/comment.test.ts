import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawFactroComment,
} from '../../../../../../../src/verticals/projects/adapters/factro/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('factro transformComment', () => {
  const rawPackageComment: RawFactroComment = {
    id: 'cmt-001',
    text: 'Please review this package.',
    creationDate: '2024-03-01T10:00:00.000Z',
    changeDate: '2024-03-01T11:00:00.000Z',
    creatorId: 'user-jane',
    taskPackageId: 'pkg-500',
    projectId: 'proj-42',
    parentId: 'cmt-parent-0',
    mandantId: 'mandant-1',
  }

  it('maps id and externalId', () => {
    const result = transformComment(rawPackageComment)
    expect(result.id).toBe('cmt-001')
    expect(result.externalId).toBe('cmt-001')
  })

  it('maps authorId from creatorId', () => {
    const result = transformComment(rawPackageComment)
    expect(result.authorId).toBe('user-jane')
  })

  it('maps body from text', () => {
    const result = transformComment(rawPackageComment)
    expect(result.body).toBe('Please review this package.')
  })

  it('taskId uses taskPackageId when isProject is false', () => {
    const result = transformComment(rawPackageComment, undefined, false)
    expect(result.taskId).toBe('pkg-500')
  })

  it('caller contextId overrides taskPackageId for package comment', () => {
    const result = transformComment(rawPackageComment, 'pkg-override', false)
    expect(result.taskId).toBe('pkg-override')
  })

  it('projectId uses contextId when isProject is true', () => {
    const rawProjectComment: RawFactroComment = {
      ...rawPackageComment,
      taskPackageId: undefined,
    }
    const result = transformComment(rawProjectComment, 'proj-context', true)
    expect(result.projectId).toBe('proj-context')
    expect(result.taskId).toBeUndefined()
  })

  it('createdAt parses ISO datetime from creationDate', () => {
    const result = transformComment(rawPackageComment)
    expect(result.createdAt).toBe('2024-03-01T10:00:00.000Z')
  })

  it('falls back to epoch when creationDate is absent', () => {
    const result = transformComment({ id: 'cmt-bare', creatorId: 'usr-1' })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('platform is factro', () => {
    const result = transformComment(rawPackageComment)
    expect(result.platform).toBe('factro')
  })

  it('metadata.parentId reflects parentId', () => {
    const result = transformComment(rawPackageComment)
    expect(result.metadata.parentId).toBe('cmt-parent-0')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(rawPackageComment, undefined, false)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
