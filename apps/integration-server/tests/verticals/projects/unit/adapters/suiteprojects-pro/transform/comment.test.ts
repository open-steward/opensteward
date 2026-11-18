import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawSuiteProjectsMessage,
} from '../../../../../../../src/verticals/projects/adapters/suiteprojects-pro/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('suiteprojects-pro transformComment', () => {
  const raw: RawSuiteProjectsMessage = {
    id: 201,
    content: 'This is looking great!',
    userId: 42,
    recordId: 101,
    tableName: 'project',
    replyToId: null,
    created: '2026-02-01T10:00:00.000Z',
    updated: '2026-02-01T10:05:00.000Z',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('201')
    expect(result.externalId).toBe('201')
  })

  it('maps authorId from userId', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('42')
  })

  it('maps body from content', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('This is looking great!')
  })

  it('taskId is always undefined (no task-level comments in this API)', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBeUndefined()
  })

  it('resolves projectId from recordId when tableName is "project"', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('101')
  })

  it('uses explicit projectId arg over resolved one', () => {
    const result = transformComment(raw, 'explicit-proj')
    expect(result.projectId).toBe('explicit-proj')
  })

  it('projectId is undefined when tableName is not "project" and no arg given', () => {
    const result = transformComment({ ...raw, tableName: 'task' })
    expect(result.projectId).toBeUndefined()
  })

  it('maps createdAt from created timestamp', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2026-02-01T10:00:00.000Z')
  })

  it('falls back to epoch for missing created', () => {
    const result = transformComment({ id: 99 })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('stores tableName in metadata', () => {
    const result = transformComment(raw)
    expect(result.metadata.tableName).toBe('project')
  })

  it('platform is suiteprojects-pro', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('suiteprojects-pro')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
