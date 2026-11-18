import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawFiberyComment,
} from '../../../../../../../src/verticals/projects/adapters/fibery/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('fibery transformComment', () => {
  const raw: RawFiberyComment = {
    'fibery/id': 'cmt-uuid-4321',
    'fibery/public-id': '17',
    'fibery/creation-date': '2026-03-10T08:30:00.000Z',
    'fibery/created-by': {
      'fibery/id': 'user-uuid-111',
      'user/name': 'Alice Smith',
    },
    'comment/document-secret': 'secret-doc-abc',
    'comments/parent': { 'fibery/id': 'task-uuid-999' },
  }

  it('maps id and externalId from fibery/id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('cmt-uuid-4321')
    expect(result.externalId).toBe('cmt-uuid-4321')
  })

  it('maps authorId from fibery/created-by fibery/id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('user-uuid-111')
  })

  it('body is always empty string (requires second API call)', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('')
  })

  it('uses caller-supplied taskId when provided', () => {
    const result = transformComment(raw, 'explicit-task-id')
    expect(result.taskId).toBe('explicit-task-id')
  })

  it('falls back to comments/parent fibery/id when taskId arg is absent', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('task-uuid-999')
  })

  it('maps createdAt from fibery/creation-date', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe(new Date('2026-03-10T08:30:00.000Z').toISOString())
  })

  it('createdAt defaults to epoch when creation-date is absent', () => {
    const result = transformComment({ 'fibery/id': 'cmt-uuid-4321' })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('platform is fibery', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('fibery')
  })

  it('metadata.documentSecret reflects comment/document-secret', () => {
    const result = transformComment(raw)
    expect(result.metadata.documentSecret).toBe('secret-doc-abc')
  })

  it('metadata.publicId reflects fibery/public-id', () => {
    const result = transformComment(raw)
    expect(result.metadata.publicId).toBe('17')
  })

  it('metadata.authorName reflects user/name from fibery/created-by', () => {
    const result = transformComment(raw)
    expect(result.metadata.authorName).toBe('Alice Smith')
  })

  it('mentions is an empty array', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual([])
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
