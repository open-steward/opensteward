import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawPingcodeComment,
} from '../../../../../../../src/verticals/projects/adapters/pingcode/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('transformComment', () => {
  it('maps basic fields from a raw pingcode comment', () => {
    const raw: RawPingcodeComment = {
      id: 'cmt_001',
      content: 'Looks good to me.',
      attachment_count: 2,
      created_at: 1705320000,
      created_by: { id: 'usr_alice', name: 'alice', display_name: 'Alice' },
      is_deleted: 0,
    }

    const result = transformComment(raw, 'task_99')

    expect(result.id).toBe('cmt_001')
    expect(result.externalId).toBe('cmt_001')
    expect(result.taskId).toBe('task_99')
    expect(result.authorId).toBe('usr_alice')
    expect(result.body).toBe('Looks good to me.')
    expect(result.attachmentCount).toBe(2)
    expect(result.platform).toBe('pingcode')
    expect(result.createdAt).toBe(new Date(1705320000 * 1000).toISOString())
    expect(result.metadata.isDeleted).toBe('0')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('resolves authorId when created_by is a plain string', () => {
    const raw: RawPingcodeComment = {
      id: 'cmt_002',
      content: 'String author.',
      created_at: 1705320000,
      created_by: 'usr_bob',
      is_deleted: 0,
    }

    const result = transformComment(raw)

    expect(result.authorId).toBe('usr_bob')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('returns empty authorId when created_by is null', () => {
    const raw: RawPingcodeComment = {
      id: 'cmt_003',
      created_by: null,
      created_at: 1705320000,
    }

    const result = transformComment(raw)

    expect(result.authorId).toBe('')
    expect(result.body).toBe('')
    expect(result.mentions).toEqual([])
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('falls back to epoch 0 when created_at is absent', () => {
    const raw: RawPingcodeComment = {
      id: 'cmt_004',
    }

    const result = transformComment(raw)

    expect(result.createdAt).toBe(new Date(0).toISOString())
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('passes taskId as undefined when not provided', () => {
    const raw: RawPingcodeComment = {
      id: 'cmt_005',
      created_at: 1705320000,
    }

    const result = transformComment(raw)

    expect(result.taskId).toBeUndefined()
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
