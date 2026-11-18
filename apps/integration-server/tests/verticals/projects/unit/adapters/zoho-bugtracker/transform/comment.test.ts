import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawZohoBugtrackerComment,
} from '../../../../../../../src/verticals/projects/adapters/zoho-bugtracker/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('zoho-bugtracker transformComment', () => {
  const raw: RawZohoBugtrackerComment = {
    id: 789,
    id_string: 'comment-789',
    content: 'Fixed in build 42.',
    content_formatted: '<p>Fixed in build 42.</p>',
    added_by: 'Alice',
    added_by_id: '55',
    added_time: '2024-01-15T10:00:00',
    added_time_long: 1705312800000,
    notify_all: false,
  }

  it('uses id_string as id when present', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('comment-789')
    expect(result.externalId).toBe('comment-789')
  })

  it('falls back to string of numeric id when id_string absent', () => {
    const result = transformComment({ ...raw, id_string: undefined })
    expect(result.id).toBe('789')
  })

  it('maps body from content', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Fixed in build 42.')
  })

  it('body is empty string when content absent', () => {
    const result = transformComment({ ...raw, content: undefined })
    expect(result.body).toBe('')
  })

  it('maps authorId from added_by_id as string', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('55')
  })

  it('authorId is empty string when added_by_id absent', () => {
    const result = transformComment({ ...raw, added_by_id: undefined })
    expect(result.authorId).toBe('')
  })

  it('maps taskId (bugId) from argument', () => {
    const result = transformComment(raw, 'bug-1', 'proj-2')
    expect(result.taskId).toBe('bug-1')
  })

  it('maps projectId from argument', () => {
    const result = transformComment(raw, 'bug-1', 'proj-2')
    expect(result.projectId).toBe('proj-2')
  })

  it('taskId and projectId are undefined when not passed', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBeUndefined()
    expect(result.projectId).toBeUndefined()
  })

  it('maps createdAt preferring added_time_long', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBeDefined()
    expect(result.createdAt).not.toBe(new Date(0).toISOString())
  })

  it('createdAt falls back to epoch when no time fields present', () => {
    const result = transformComment({ ...raw, added_time_long: undefined, added_time: undefined })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('platform is zoho-bugtracker', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('zoho-bugtracker')
  })

  it('metadata includes addedBy', () => {
    const result = transformComment(raw)
    expect(result.metadata.addedBy).toBe('Alice')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'bug-1', 'proj-2')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
