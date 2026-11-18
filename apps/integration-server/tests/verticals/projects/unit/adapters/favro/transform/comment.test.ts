import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawFavroComment,
} from '../../../../../../../src/verticals/projects/adapters/favro/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('favro transformComment', () => {
  const raw: RawFavroComment = {
    commentId: 'cmt-favro-1',
    organizationId: 'org-abc',
    cardCommonId: 'card-common-99',
    comment: 'Great progress on this card!',
    userId: 'user-bob',
    created: '2024-04-05T10:00:00.000Z',
    lastUpdated: '2024-04-05T11:00:00.000Z',
    attachments: [{ name: 'screenshot.png', fileURL: 'https://example.com/screenshot.png' }],
  }

  it('maps id and externalId from commentId', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('cmt-favro-1')
    expect(result.externalId).toBe('cmt-favro-1')
  })

  it('maps authorId from userId', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('user-bob')
  })

  it('maps body from comment field', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Great progress on this card!')
  })

  it('taskId uses caller-supplied arg', () => {
    const result = transformComment(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('taskId falls back to cardCommonId when no arg supplied', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('card-common-99')
  })

  it('projectId is always undefined', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBeUndefined()
  })

  it('attachmentCount reflects attachments array length', () => {
    const result = transformComment(raw)
    expect(result.attachmentCount).toBe(1)
  })

  it('attachmentCount is 0 when attachments is absent', () => {
    const result = transformComment({ ...raw, attachments: undefined })
    expect(result.attachmentCount).toBe(0)
  })

  it('createdAt parses from created field', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-04-05T10:00:00.000Z')
  })

  it('updatedAt parses from lastUpdated field', () => {
    const result = transformComment(raw)
    expect(result.updatedAt).toBe('2024-04-05T11:00:00.000Z')
  })

  it('falls back to epoch when created is absent', () => {
    const result = transformComment({ commentId: 'cmt-bare' })
    expect(result.createdAt).toBe(new Date(0).toISOString())
  })

  it('platform is favro', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('favro')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })
})
