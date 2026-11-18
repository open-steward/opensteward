import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawProductboardNote,
} from '../../../../../../../src/verticals/projects/adapters/productboard/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('productboard transformComment', () => {
  const raw: RawProductboardNote = {
    id: 'note-abc',
    title: 'Customer request',
    content: 'Please add dark mode to the dashboard.',
    state: 'open',
    displayUrl: 'https://productboard.example.com/notes/note-abc',
    owner: { name: 'Alice Owner', email: 'alice@example.com' },
    createdBy: { id: 'user-1', name: 'Bob Creator', email: 'bob@example.com' },
    company: { id: 'co-99' },
    tags: ['ux', 'dashboard'],
    source: { origin: 'intercom', record_id: 'ic-123' },
    createdAt: '2025-03-15T10:00:00.000Z',
    updatedAt: '2025-04-01T08:30:00.000Z',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('note-abc')
    expect(result.externalId).toBe('note-abc')
  })

  it('uses createdBy.id as authorId when present', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('user-1')
  })

  it('falls back to owner.email as authorId when createdBy is absent', () => {
    const minimal: RawProductboardNote = {
      id: 'note-xyz',
      owner: { email: 'owner@example.com' },
    }
    const result = transformComment(minimal)
    expect(result.authorId).toBe('owner@example.com')
  })

  it('uses content as body when present', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Please add dark mode to the dashboard.')
  })

  it('falls back to title as body when content is absent', () => {
    const noContent: RawProductboardNote = { id: 'n2', title: 'Title only' }
    const result = transformComment(noContent)
    expect(result.body).toBe('Title only')
  })

  it('maps taskId from argument', () => {
    const result = transformComment(raw, 'task-999')
    expect(result.taskId).toBe('task-999')
  })

  it('taskId is undefined when argument is omitted', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBeUndefined()
  })

  it('createdAt is ISO 8601', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2025-03-15T10:00:00.000Z')
  })

  it('updatedAt is ISO 8601', () => {
    const result = transformComment(raw)
    expect(result.updatedAt).toBe('2025-04-01T08:30:00.000Z')
  })

  it('platform is productboard', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('productboard')
  })

  it('metadata includes ownerEmail and tagCount', () => {
    const result = transformComment(raw)
    expect(result.metadata.ownerEmail).toBe('alice@example.com')
    expect(result.metadata.tagCount).toBe('2')
  })

  it('metadata includes sourceOrigin', () => {
    const result = transformComment(raw)
    expect(result.metadata.sourceOrigin).toBe('intercom')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'task-1')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('uses epoch fallback createdAt when createdAt is absent', () => {
    const minimal: RawProductboardNote = { id: 'n3' }
    const result = transformComment(minimal)
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })
})
