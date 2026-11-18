import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawOnesComment,
} from '../../../../../../../src/verticals/projects/adapters/ones/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('ones transformComment', () => {
  const raw: RawOnesComment = {
    id: 'cmt_001',
    text: 'Looks good to me.',
    owner: { id: 'usr_42', name: 'Alice' },
    createTime: 1700000000,
    updateTime: 1700001000,
  }

  it('maps id and body from text', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('cmt_001')
    expect(result.body).toBe('Looks good to me.')
  })

  it('extracts authorId from owner object', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('usr_42')
  })

  it('extracts authorId from owner string', () => {
    const result = transformComment({ id: 'c1', owner: 'usr_99' })
    expect(result.authorId).toBe('usr_99')
  })

  it('authorId is empty string when owner is absent', () => {
    const result = transformComment({ id: 'c1' })
    expect(result.authorId).toBe('')
  })

  it('falls back to content when text is absent', () => {
    const result = transformComment({ id: 'c2', content: 'Rich body here' })
    expect(result.body).toBe('Rich body here')
  })

  it('maps taskId when provided', () => {
    const result = transformComment(raw, 'task_7')
    expect(result.taskId).toBe('task_7')
  })

  it('converts epoch seconds for createdAt to ISO string', () => {
    const result = transformComment(raw)
    // 1700000000 is treated as epoch seconds → multiplied by 1000
    expect(result.createdAt).toBe(new Date(1700000000 * 1000).toISOString())
  })

  it('createdAt falls back to epoch zero when absent', () => {
    const result = transformComment({ id: 'c3' })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('platform is ones', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('ones')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'task_7')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
