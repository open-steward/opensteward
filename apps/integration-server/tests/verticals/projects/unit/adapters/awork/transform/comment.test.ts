import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawAworkComment,
} from '../../../../../../../src/verticals/projects/adapters/awork/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('awork transformComment', () => {
  const raw: RawAworkComment = {
    id: 'cmt-awork-1',
    plainFormattedMessage: 'Looks good!',
    message: 'fallback message',
    createdOn: '2024-04-01T10:00:00Z',
    createdBy: 'usr-11',
    entityId: 'task-99',
    entityType: 'tasks',
    mentions: [{ userId: 'usr-22' }, { id: 'usr-33' }],
  }

  it('maps id and externalId', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('cmt-awork-1')
    expect(result.externalId).toBe('cmt-awork-1')
  })

  it('body prefers plainFormattedMessage over message', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Looks good!')
  })

  it('body falls back to message when plainFormattedMessage is absent', () => {
    const result = transformComment({ ...raw, plainFormattedMessage: undefined })
    expect(result.body).toBe('fallback message')
  })

  it('authorId from createdBy', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('usr-11')
  })

  it('taskId resolved from entityType=tasks + entityId when no arg given', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('task-99')
  })

  it('caller-supplied taskId takes precedence', () => {
    const result = transformComment(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('projectId is undefined when entityType is tasks', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBeUndefined()
  })

  it('projectId is set when entityType is projects', () => {
    const r: RawAworkComment = { ...raw, entityType: 'projects', entityId: 'proj-5' }
    const result = transformComment(r)
    expect(result.projectId).toBe('proj-5')
    expect(result.taskId).toBeUndefined()
  })

  it('mentions maps userId then falls back to id', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual(['usr-22', 'usr-33'])
  })

  it('attachmentCount is always 0', () => {
    const result = transformComment(raw)
    expect(result.attachmentCount).toBe(0)
  })

  it('createdAt maps from ISO string', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-04-01T10:00:00.000Z')
  })

  it('platform is awork', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('awork')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('createdAt falls back to epoch-0 when createdOn is absent', () => {
    const result = transformComment({ id: 'x', createdBy: 'u1' })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })
})
