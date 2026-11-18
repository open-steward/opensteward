import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawPaymoComment,
} from '../../../../../../../src/verticals/projects/adapters/paymo/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

const baseRaw: RawPaymoComment = {
  id: 101,
  content: 'Looks good to me!',
  thread_id: 55,
  user_id: 42,
  created_on: '2024-01-15T12:00:00.000Z',
  updated_on: '2024-01-16T08:30:00.000Z',
}

describe('transformComment', () => {
  it('maps id and externalId as stringified numeric id', () => {
    const result = transformComment(baseRaw, 'task-99')
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps authorId from user_id as string', () => {
    const result = transformComment(baseRaw, 'task-99')
    expect(result.authorId).toBe('42')
  })

  it('maps body from content', () => {
    const result = transformComment(baseRaw, 'task-99')
    expect(result.body).toBe('Looks good to me!')
  })

  it('passes through taskId argument', () => {
    const result = transformComment(baseRaw, 'task-99')
    expect(result.taskId).toBe('task-99')
  })

  it('sets platform to paymo', () => {
    const result = transformComment(baseRaw)
    expect(result.platform).toBe('paymo')
  })

  it('sets mentions to empty array and attachmentCount to 0', () => {
    const result = transformComment(baseRaw)
    expect(result.mentions).toEqual([])
    expect(result.attachmentCount).toBe(0)
  })

  it('maps createdAt from created_on as ISO string', () => {
    const result = transformComment(baseRaw)
    expect(result.createdAt).toBe(new Date('2024-01-15T12:00:00.000Z').toISOString())
  })

  it('maps updatedAt from updated_on as ISO string', () => {
    const result = transformComment(baseRaw)
    expect(result.updatedAt).toBe(new Date('2024-01-16T08:30:00.000Z').toISOString())
  })

  it('defaults body to empty string when content is absent', () => {
    const raw: RawPaymoComment = { ...baseRaw, content: undefined }
    const result = transformComment(raw)
    expect(result.body).toBe('')
  })

  it('defaults authorId to empty string when user_id is absent', () => {
    const raw: RawPaymoComment = { ...baseRaw, user_id: undefined }
    const result = transformComment(raw)
    expect(result.authorId).toBe('')
  })

  it('stores thread_id in metadata', () => {
    const result = transformComment(baseRaw)
    expect(result.metadata).toMatchObject({ threadId: '55' })
  })

  it('produces output that passes CommentSchema validation', () => {
    const result = transformComment(baseRaw, 'task-99')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
