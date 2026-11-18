import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawSeatableComment,
} from '../../../../../../../src/verticals/projects/adapters/seatable/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('seatable transformComment', () => {
  const raw: RawSeatableComment = {
    id: 88,
    comment: 'Looks good to me!',
    author: 'alice@example.com',
    created_at: '2026-04-05T10:30:00Z',
    updated_at: '2026-04-05T10:35:00Z',
    row_id: 'row_abc123',
    dtable_uuid: 'base-uuid-001',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('88')
    expect(result.externalId).toBe('88')
  })

  it('maps body from comment field', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Looks good to me!')
  })

  it('maps authorId from string author (email)', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('alice@example.com')
  })

  it('maps authorId from author object email', () => {
    const result = transformComment({ ...raw, author: { email: 'bob@example.com', name: 'Bob' } })
    expect(result.authorId).toBe('bob@example.com')
  })

  it('maps authorId from author object name when email absent', () => {
    const result = transformComment({ ...raw, author: { name: 'Charlie' } })
    expect(result.authorId).toBe('Charlie')
  })

  it('authorId is empty string when author is absent', () => {
    const result = transformComment({ id: 1, author: undefined })
    expect(result.authorId).toBe('')
  })

  it('taskId uses rowId override param', () => {
    const result = transformComment(raw, 'override-row', undefined)
    expect(result.taskId).toBe('override-row')
  })

  it('taskId falls back to raw.row_id', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('row_abc123')
  })

  it('projectId uses baseUuid override param', () => {
    const result = transformComment(raw, undefined, 'override-base')
    expect(result.projectId).toBe('override-base')
  })

  it('projectId falls back to raw.dtable_uuid', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('base-uuid-001')
  })

  it('maps createdAt from created_at', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2026-04-05T10:30:00.000Z')
  })

  it('createdAt falls back to epoch when created_at is absent', () => {
    const result = transformComment({ id: 1 })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('stores updatedAt in metadata', () => {
    const result = transformComment(raw)
    expect(result.metadata.updatedAt).toBe('2026-04-05T10:35:00Z')
  })

  it('platform is seatable', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('seatable')
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
