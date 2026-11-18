import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawActivecollabComment,
} from '../../../../../../../src/verticals/projects/adapters/activecollab/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('activecollab transformComment', () => {
  const raw: RawActivecollabComment = {
    id: 101,
    parent_type: 'Task',
    parent_id: 55,
    body: 'Looks good to me.',
    created_on: 1700000000,
    created_by_id: 7,
    updated_on: 1700001000,
    attachments: [{}, {}],
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('resolves taskId from parent_type=Task + parent_id when no explicit taskId given', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('55')
  })

  it('caller-supplied taskId takes precedence over parent_id', () => {
    const result = transformComment(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('maps authorId from created_by_id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('7')
  })

  it('maps body from body field', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Looks good to me.')
  })

  it('falls back to body_plain_text when body is absent', () => {
    const r: RawActivecollabComment = {
      id: 9,
      body_plain_text: 'plain text fallback',
      created_on: 1700000000,
      created_by_id: 1,
    }
    const result = transformComment(r)
    expect(result.body).toBe('plain text fallback')
  })

  it('attachmentCount reflects attachments array length', () => {
    const result = transformComment(raw)
    expect(result.attachmentCount).toBe(2)
  })

  it('createdAt is epoch-seconds converted to ISO', () => {
    const result = transformComment(raw)
    // 1700000000 seconds → 2023-11-14T22:13:20.000Z
    expect(result.createdAt).toBe(new Date(1700000000 * 1000).toISOString())
  })

  it('platform is activecollab', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('activecollab')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw, 'task-55', 'proj-10')
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('taskId is undefined when parent_type is not Task and no taskId supplied', () => {
    const r: RawActivecollabComment = {
      id: 1,
      parent_type: 'Project',
      parent_id: 9,
      created_on: 1700000000,
      created_by_id: 1,
    }
    const result = transformComment(r)
    expect(result.taskId).toBeUndefined()
  })

  it('authorId is empty string when created_by_id is absent', () => {
    const r: RawActivecollabComment = { id: 2, created_on: 1700000000 }
    const result = transformComment(r)
    expect(result.authorId).toBe('')
  })
})
