import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawSmarttaskActivity,
} from '../../../../../../../src/verticals/projects/adapters/smarttask/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('smarttask transformComment', () => {
  const raw: RawSmarttaskActivity = {
    activity_id: 'act_001',
    record_id: 'rec_001',
    created_by_user: { user_id: 99, full_name: 'Alice Smith', email: 'alice@example.com' },
    type: 'comment',
    task_id: 'task_001',
    text: 'Looks good, approved!',
    created_at: '2026-04-12T08:00:00Z',
    modified_at: '2026-04-12T08:01:00Z',
  }

  it('maps id and externalId from activity_id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('act_001')
    expect(result.externalId).toBe('act_001')
  })

  it('maps body from text field', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Looks good, approved!')
  })

  it('body is empty string when text is absent', () => {
    const result = transformComment({ activity_id: 'act_x', text: undefined })
    expect(result.body).toBe('')
  })

  it('maps authorId from created_by_user.user_id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('99')
  })

  it('authorId is empty string when created_by_user is null', () => {
    const result = transformComment({ ...raw, created_by_user: null })
    expect(result.authorId).toBe('')
  })

  it('taskId uses override param', () => {
    const result = transformComment(raw, 'override-task')
    expect(result.taskId).toBe('override-task')
  })

  it('taskId falls back to raw.task_id', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('task_001')
  })

  it('taskId falls back to record_id when task_id is absent', () => {
    const result = transformComment({ ...raw, task_id: null })
    expect(result.taskId).toBe('rec_001')
  })

  it('projectId is always undefined', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBeUndefined()
  })

  it('maps createdAt from created_at', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2026-04-12T08:00:00.000Z')
  })

  it('createdAt falls back to epoch when created_at is absent', () => {
    const result = transformComment({ activity_id: 'act_x' })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('stores type in metadata', () => {
    const result = transformComment(raw)
    expect(result.metadata.type).toBe('comment')
  })

  it('platform is smarttask', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('smarttask')
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
