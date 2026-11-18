import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawMeisterplanComment,
} from '../../../../../../../src/verticals/projects/adapters/meisterplan/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('meisterplan transformComment', () => {
  const raw: RawMeisterplanComment = {
    id: 'cmt-001',
    content: 'Ready for review.',
    author: { id: 'usr-7', name: 'Alice' },
    createdAt: '2026-05-10T14:00:00.000Z',
    updatedAt: '2026-05-11T09:00:00.000Z',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformComment(raw, 'proj-1')
    expect(result.id).toBe('cmt-001')
    expect(result.externalId).toBe('cmt-001')
  })

  it('maps body from content', () => {
    const result = transformComment(raw, 'proj-1')
    expect(result.body).toBe('Ready for review.')
  })

  it('maps authorId from author.id', () => {
    const result = transformComment(raw, 'proj-1')
    expect(result.authorId).toBe('usr-7')
  })

  it('maps projectId from the required argument', () => {
    const result = transformComment(raw, 'proj-42')
    expect(result.projectId).toBe('proj-42')
  })

  it('taskId is always undefined (project-level comment)', () => {
    const result = transformComment(raw, 'proj-1')
    expect(result.taskId).toBeUndefined()
  })

  it('createdAt is the ISO string from createdAt', () => {
    const result = transformComment(raw, 'proj-1')
    expect(result.createdAt).toBe('2026-05-10T14:00:00.000Z')
  })

  it('updatedAt is the ISO string from updatedAt', () => {
    const result = transformComment(raw, 'proj-1')
    expect(result.updatedAt).toBe('2026-05-11T09:00:00.000Z')
  })

  it('platform is meisterplan', () => {
    const result = transformComment(raw, 'proj-1')
    expect(result.platform).toBe('meisterplan')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'proj-1', 'scenario-1')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('authorId falls back to empty string when author is absent', () => {
    const result = transformComment({ id: 'cmt-2', content: 'hi' }, 'proj-1')
    expect(result.authorId).toBe('')
  })

  it('createdAt falls back to epoch ISO when createdAt is absent', () => {
    const result = transformComment({ id: 'cmt-3' }, 'proj-1')
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })
})
