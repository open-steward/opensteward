import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawNextcloudDeckComment,
} from '../../../../../../../src/verticals/projects/adapters/nextcloud-deck/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('nextcloud-deck transformComment', () => {
  const raw: RawNextcloudDeckComment = {
    id: 300,
    objectId: 55,
    message: 'Please review the latest changes.',
    actorId: 'admin',
    actorType: 'users',
    creationDateTime: '2026-06-01T09:00:00.000Z',
    mentions: [
      { mentionId: 'jdoe', mentionType: 'user' },
      { mentionId: 'alice', mentionType: 'user' },
    ],
    replyTo: null,
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('300')
    expect(result.externalId).toBe('300')
  })

  it('maps body from message', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Please review the latest changes.')
  })

  it('maps authorId from actorId', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('admin')
  })

  it('taskId comes from supplied argument', () => {
    const result = transformComment(raw, 'task-55')
    expect(result.taskId).toBe('task-55')
  })

  it('taskId falls back to raw.objectId when no argument', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('55')
  })

  it('mentions contains mentionId strings', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual(['jdoe', 'alice'])
  })

  it('createdAt is ISO string from creationDateTime', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2026-06-01T09:00:00.000Z')
  })

  it('updatedAt is not set (OCS comments carry no update timestamp)', () => {
    const result = transformComment(raw)
    expect(result.updatedAt).toBeUndefined()
  })

  it('platform is nextcloud-deck', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('nextcloud-deck')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'task-55')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('authorId falls back to empty string when actorId is absent', () => {
    const result = transformComment({ id: 1 })
    expect(result.authorId).toBe('')
  })

  it('createdAt falls back to epoch ISO when creationDateTime is absent', () => {
    const result = transformComment({ id: 2 })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })
})
