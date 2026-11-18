import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawProductplanComment,
} from '../../../../../../../src/verticals/projects/adapters/productplan/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('productplan transformComment', () => {
  const raw: RawProductplanComment = {
    id: 101,
    body: 'Looks good to ship.',
    author: { id: 55, name: 'Alice', email: 'alice@example.com' },
    created_at: '2025-05-10T14:00:00.000Z',
    updated_at: '2025-05-11T09:00:00.000Z',
    bar_id: 200,
    roadmap_id: 300,
  }

  it('maps id to string', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps body from body field', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Looks good to ship.')
  })

  it('falls back to text field when body is absent', () => {
    const noBody: RawProductplanComment = { id: 2, text: 'text fallback' }
    const result = transformComment(noBody)
    expect(result.body).toBe('text fallback')
  })

  it('maps authorId from author.id as string', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('55')
  })

  it('falls back to user field for author', () => {
    const withUser: RawProductplanComment = { id: 3, user: { id: 77, name: 'Bob' }, body: 'hi' }
    const result = transformComment(withUser)
    expect(result.authorId).toBe('77')
  })

  it('taskId is resolved from barId argument', () => {
    const result = transformComment(raw, 'bar-arg', 'road-arg')
    expect(result.taskId).toBe('bar-arg')
  })

  it('taskId falls back to raw.bar_id when no argument given', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('200')
  })

  it('projectId falls back to raw.roadmap_id', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('300')
  })

  it('createdAt is ISO 8601', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2025-05-10T14:00:00.000Z')
  })

  it('platform is productplan', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('productplan')
  })

  it('createdAt is epoch fallback when created_at absent', () => {
    const minimal: RawProductplanComment = { id: 9 }
    const result = transformComment(minimal)
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
