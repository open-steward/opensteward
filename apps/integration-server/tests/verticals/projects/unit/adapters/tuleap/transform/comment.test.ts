import { describe, it, expect } from 'vitest'
import {
  transformChangeset,
  type RawTuleapChangeset,
} from '../../../../../../../src/verticals/projects/adapters/tuleap/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('tuleap transformChangeset', () => {
  const raw: RawTuleapChangeset = {
    id: 5001,
    submitted_by: {
      id: 42,
      display_name: 'Jane Dev',
      username: 'jdev',
      email: 'jdev@example.com',
      is_anonymous: false,
    },
    submitted_on: '2024-03-01T10:00:00.000Z',
    last_comment: {
      format: 'commonmark',
      body: '## Note\nThis is the raw body.',
      post_processed_body: '<h2>Note</h2><p>This is the rendered body.</p>',
    },
  }

  it('maps id and externalId from raw.id as string', () => {
    const result = transformChangeset(raw)
    expect(result.id).toBe('5001')
    expect(result.externalId).toBe('5001')
  })

  it('prefers post_processed_body over body for body field', () => {
    const result = transformChangeset(raw)
    expect(result.body).toBe('<h2>Note</h2><p>This is the rendered body.</p>')
  })

  it('falls back to body when post_processed_body is absent', () => {
    const result = transformChangeset({
      ...raw,
      last_comment: { format: 'text', body: 'plain text' },
    })
    expect(result.body).toBe('plain text')
  })

  it('body is empty string when last_comment is absent', () => {
    const result = transformChangeset({ id: 1 })
    expect(result.body).toBe('')
  })

  it('authorId from submitted_by.id as string', () => {
    const result = transformChangeset(raw)
    expect(result.authorId).toBe('42')
  })

  it('authorId is empty string when submitted_by is absent', () => {
    const result = transformChangeset({ id: 1 })
    expect(result.authorId).toBe('')
  })

  it('taskId uses caller-supplied taskId arg', () => {
    const result = transformChangeset(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('projectId uses caller-supplied projectId arg', () => {
    const result = transformChangeset(raw, undefined, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('createdAt is ISO string from submitted_on', () => {
    const result = transformChangeset(raw)
    expect(result.createdAt).toBe(new Date('2024-03-01T10:00:00.000Z').toISOString())
  })

  it('createdAt defaults to epoch when submitted_on is absent', () => {
    const result = transformChangeset({ id: 1 })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('platform is tuleap', () => {
    const result = transformChangeset(raw)
    expect(result.platform).toBe('tuleap')
  })

  it('metadata stores authorName', () => {
    const result = transformChangeset(raw)
    expect(result.metadata['authorName']).toBe('Jane Dev')
  })

  it('metadata stores format', () => {
    const result = transformChangeset(raw)
    expect(result.metadata['format']).toBe('commonmark')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformChangeset(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
