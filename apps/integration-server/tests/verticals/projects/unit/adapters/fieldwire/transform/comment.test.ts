import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawFieldwireBubble,
} from '../../../../../../../src/verticals/projects/adapters/fieldwire/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('fieldwire transformComment', () => {
  const raw: RawFieldwireBubble = {
    id: 'bubble-uuid-001',
    task_id: 'task-uuid-001',
    project_id: 'proj-uuid-001',
    creator_user_id: 88,
    note: 'Please verify the wiring in room 4B.',
    note_type: 'note',
    device_created_at: '2026-03-10T14:00:00Z',
    device_updated_at: '2026-03-10T14:05:00Z',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('bubble-uuid-001')
    expect(result.externalId).toBe('bubble-uuid-001')
  })

  it('maps body from the note field', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Please verify the wiring in room 4B.')
  })

  it('maps authorId as stringified creator_user_id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('88')
  })

  it('taskId uses override param when provided', () => {
    const result = transformComment(raw, 'override-task-id')
    expect(result.taskId).toBe('override-task-id')
  })

  it('taskId falls back to raw.task_id when no param given', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('task-uuid-001')
  })

  it('projectId uses override param when provided', () => {
    const result = transformComment(raw, undefined, 'override-proj-id')
    expect(result.projectId).toBe('override-proj-id')
  })

  it('projectId falls back to raw.project_id when no param given', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('proj-uuid-001')
  })

  it('stores noteType in metadata', () => {
    const result = transformComment(raw)
    expect(result.metadata.noteType).toBe('note')
  })

  it('maps createdAt from device_created_at', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2026-03-10T14:00:00.000Z')
  })

  it('platform is fieldwire', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('fieldwire')
  })

  it('authorId is empty string when creator_user_id is null', () => {
    const result = transformComment({ ...raw, creator_user_id: null })
    expect(result.authorId).toBe('')
  })

  it('body is empty string when note is null', () => {
    const result = transformComment({ ...raw, note: null })
    expect(result.body).toBe('')
  })

  it('createdAt falls back to epoch when device_created_at is absent', () => {
    const result = transformComment({ id: 'bubble-no-time' })
    expect(result.createdAt).toBe(new Date(0).toISOString())
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
