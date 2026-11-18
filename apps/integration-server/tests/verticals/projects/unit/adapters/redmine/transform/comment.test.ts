import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  type RawRedmineJournal,
} from '../../../../../../../src/verticals/projects/adapters/redmine/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('redmine transformJournal', () => {
  const raw: RawRedmineJournal = {
    id: 101,
    user: { id: 5, name: 'Alice' },
    notes: 'A comment',
    created_on: '2024-01-15T10:00:00.000Z',
    private_notes: false,
  }

  it('maps id to string', () => {
    const result = transformJournal(raw, 'task_42', 'proj_7')
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps authorId from user.id', () => {
    const result = transformJournal(raw, 'task_42', 'proj_7')
    expect(result.authorId).toBe('5')
  })

  it('maps body from notes', () => {
    const result = transformJournal(raw, 'task_42', 'proj_7')
    expect(result.body).toBe('A comment')
  })

  it('maps createdAt from created_on', () => {
    const result = transformJournal(raw, 'task_42', 'proj_7')
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('maps taskId from argument', () => {
    const result = transformJournal(raw, 'task_42', 'proj_7')
    expect(result.taskId).toBe('task_42')
  })

  it('maps projectId from argument', () => {
    const result = transformJournal(raw, 'task_42', 'proj_7')
    expect(result.projectId).toBe('proj_7')
  })

  it('platform is redmine', () => {
    const result = transformJournal(raw, 'task_42', 'proj_7')
    expect(result.platform).toBe('redmine')
  })

  it('metadata includes authorName', () => {
    const result = transformJournal(raw, 'task_42', 'proj_7')
    expect(result.metadata.authorName).toBe('Alice')
  })

  it('metadata includes privateNotes', () => {
    const result = transformJournal(raw, 'task_42', 'proj_7')
    expect(result.metadata.privateNotes).toBe('false')
  })

  it('falls back to epoch when created_on is absent', () => {
    const result = transformJournal({ id: 101 }, 'task_42')
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('authorId is empty string when user is absent', () => {
    const result = transformJournal({ id: 101 })
    expect(result.authorId).toBe('')
  })

  it('body is empty string when notes is absent', () => {
    const result = transformJournal({ id: 101 })
    expect(result.body).toBe('')
  })

  it('taskId and projectId are undefined when not passed', () => {
    const result = transformJournal(raw)
    expect(result.taskId).toBeUndefined()
    expect(result.projectId).toBeUndefined()
  })

  it('passes CommentSchema.parse', () => {
    const result = transformJournal(raw, 'task_42', 'proj_7')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
