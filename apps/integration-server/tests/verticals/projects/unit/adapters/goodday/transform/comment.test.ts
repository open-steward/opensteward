import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawGooddayMessage,
} from '../../../../../../../src/verticals/projects/adapters/goodday/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('goodday transformComment', () => {
  const raw: RawGooddayMessage = {
    id: 'msg_abc123',
    message: 'Please review the attached spec.',
    fromUserId: 'usr_jane',
    toUserId: 'usr_bob',
    momentCreated: 1700000000000,
    taskId: 'task_xyz',
    type: 'reply',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('msg_abc123')
    expect(result.externalId).toBe('msg_abc123')
  })

  it('maps authorId from fromUserId', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('usr_jane')
  })

  it('maps body from message', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Please review the attached spec.')
  })

  it('maps taskId from raw.taskId when no arg given', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('task_xyz')
  })

  it('caller-supplied taskId overrides raw.taskId', () => {
    const result = transformComment(raw, 'task_override')
    expect(result.taskId).toBe('task_override')
  })

  it('projectId is always undefined', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBeUndefined()
  })

  it('createdAt converts epoch ms to ISO string', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe(new Date(1700000000000).toISOString())
  })

  it('createdAt falls back to epoch-zero ISO when momentCreated is absent', () => {
    const result = transformComment({ ...raw, momentCreated: null })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('mentions is always an empty array', () => {
    const result = transformComment(raw)
    expect(result.mentions).toEqual([])
  })

  it('attachmentCount is always 0', () => {
    const result = transformComment(raw)
    expect(result.attachmentCount).toBe(0)
  })

  it('platform is goodday', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('goodday')
  })

  it('metadata.type reflects raw.type', () => {
    const result = transformComment(raw)
    expect(result.metadata['type']).toBe('reply')
  })

  it('metadata.toUserId reflects raw.toUserId', () => {
    const result = transformComment(raw)
    expect(result.metadata['toUserId']).toBe('usr_bob')
  })

  it('metadata omits null toUserId', () => {
    const result = transformComment({ ...raw, toUserId: null })
    expect(result.metadata['toUserId']).toBeUndefined()
  })

  it('authorId is empty string when fromUserId is absent', () => {
    const result = transformComment({ id: 'msg_1', fromUserId: null })
    expect(result.authorId).toBe('')
  })

  it('body is empty string when message is absent', () => {
    const result = transformComment({ id: 'msg_1' })
    expect(result.body).toBe('')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('passes CommentSchema.parse with minimal raw', () => {
    const result = transformComment({ id: 'msg_min' })
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
