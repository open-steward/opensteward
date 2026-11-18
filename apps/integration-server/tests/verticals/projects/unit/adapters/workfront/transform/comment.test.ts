import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawWorkfrontNote,
} from '../../../../../../../src/verticals/projects/adapters/workfront/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('workfront transformComment', () => {
  const raw: RawWorkfrontNote = {
    ID: 'note-abc',
    noteText: 'Please review before EOD.',
    subject: 'Review request',
    ownerID: 'user-9',
    projectID: 'proj-5',
    taskID: 'task-3',
    opTaskID: null,
    parentNoteID: null,
    entryDate: '2024-04-10T09:30:00.000Z',
  }

  it('maps id and externalId from ID', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('note-abc')
    expect(result.externalId).toBe('note-abc')
  })

  it('maps body from noteText', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Please review before EOD.')
  })

  it('maps authorId from ownerID', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('user-9')
  })

  it('maps taskId from raw.taskID when no param', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('task-3')
  })

  it('explicit taskId param overrides raw.taskID', () => {
    const result = transformComment(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('maps projectId from raw.projectID when no param', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('proj-5')
  })

  it('explicit projectId param overrides raw.projectID', () => {
    const result = transformComment(raw, undefined, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('falls back taskId to opTaskID when taskID absent', () => {
    const result = transformComment({ ...raw, taskID: null, opTaskID: 'optask-7' })
    expect(result.taskId).toBe('optask-7')
  })

  it('maps createdAt from entryDate', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-04-10T09:30:00.000Z')
  })

  it('falls back to epoch when entryDate absent', () => {
    const result = transformComment({ ...raw, entryDate: undefined })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('platform is workfront', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('workfront')
  })

  it('metadata contains subject', () => {
    const result = transformComment(raw)
    expect(result.metadata.subject).toBe('Review request')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
