import { describe, it, expect } from 'vitest'
import {
  transformComment,
  isComment,
  type RawOpenProjectActivity,
} from '../../../../../../../src/verticals/projects/adapters/openproject/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('openproject transformComment', () => {
  const raw: RawOpenProjectActivity = {
    _type: 'Activity::Comment',
    id: 77,
    comment: { format: 'markdown', raw: 'This is a comment.', html: '<p>This is a comment.</p>' },
    createdAt: '2026-03-10T12:00:00.000Z',
    updatedAt: '2026-03-10T13:00:00.000Z',
    _links: {
      user: { href: '/api/v3/users/42', title: 'Alice' },
      workPackage: { href: '/api/v3/work_packages/99', title: 'Bug fix' },
    },
  }

  it('maps id and body from comment.raw', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('77')
    expect(result.body).toBe('This is a comment.')
  })

  it('extracts authorId from _links.user href', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('42')
  })

  it('extracts taskId from _links.workPackage href', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('99')
  })

  it('taskId argument overrides _links.workPackage', () => {
    const result = transformComment(raw, 'task_override')
    expect(result.taskId).toBe('task_override')
  })

  it('maps createdAt', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2026-03-10T12:00:00.000Z')
  })

  it('createdAt falls back to epoch zero when absent', () => {
    const result = transformComment({ _type: 'Activity::Comment', id: 1 })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('platform is openproject', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('openproject')
  })

  it('metadata.activityType is set', () => {
    const result = transformComment(raw)
    expect(result.metadata.activityType).toBe('Activity::Comment')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})

describe('openproject isComment', () => {
  it('returns true for Activity::Comment type', () => {
    expect(isComment({ _type: 'Activity::Comment' })).toBe(true)
  })

  it('returns true when comment.raw has content', () => {
    expect(isComment({ comment: { raw: 'some text' } })).toBe(true)
  })

  it('returns false for plain Activity type with no body', () => {
    expect(isComment({ _type: 'Activity', comment: { raw: '' } })).toBe(false)
  })

  it('returns false when comment is absent', () => {
    expect(isComment({})).toBe(false)
  })
})
