import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawKantataPost,
} from '../../../../../../../src/verticals/projects/adapters/kantata/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('kantata transformComment', () => {
  const raw: RawKantataPost = {
    id: 'post-789',
    message: 'Approved the mockups.',
    user_id: 'usr-7',
    workspace_id: 'ws-123',
    story_id: 'story-456',
    recipient_ids: ['usr-1', 'usr-2'],
    attachment_ids: ['att-1'],
    has_attachments: true,
    reply_count: 2,
    private: false,
    created_at: '2024-07-10T10:00:00.000Z',
    updated_at: '2024-07-10T10:05:00.000Z',
  }

  it('maps id', () => {
    const result = transformComment(raw)
    expect(result.id).toBe('post-789')
    expect(result.externalId).toBe('post-789')
  })

  it('maps body from message', () => {
    const result = transformComment(raw)
    expect(result.body).toBe('Approved the mockups.')
  })

  it('maps taskId from story_id', () => {
    const result = transformComment(raw)
    expect(result.taskId).toBe('story-456')
  })

  it('overrides taskId with explicit argument', () => {
    const result = transformComment(raw, 'task-override')
    expect(result.taskId).toBe('task-override')
  })

  it('maps projectId from workspace_id', () => {
    const result = transformComment(raw)
    expect(result.projectId).toBe('ws-123')
  })

  it('overrides projectId with explicit argument', () => {
    const result = transformComment(raw, undefined, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('maps authorId from user_id', () => {
    const result = transformComment(raw)
    expect(result.authorId).toBe('usr-7')
  })

  it('does not report a private post recipient_ids (its audience) as mentions', () => {
    const result = transformComment({ ...raw, private: true })
    expect(result.mentions).toEqual([])
  })

  it('maps attachmentCount from attachment_ids length when has_attachments', () => {
    const result = transformComment(raw)
    expect(result.attachmentCount).toBe(1)
  })

  it('attachmentCount is 0 when has_attachments is false', () => {
    const result = transformComment({ ...raw, has_attachments: false })
    expect(result.attachmentCount).toBe(0)
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformComment(raw)
    expect(result.createdAt).toBe('2024-07-10T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-07-10T10:05:00.000Z')
  })

  it('platform is kantata', () => {
    const result = transformComment(raw)
    expect(result.platform).toBe('kantata')
  })

  it('metadata contains replyCount and private', () => {
    const result = transformComment(raw)
    expect(result.metadata.replyCount).toBe('2')
    expect(result.metadata.private).toBe('false')
  })

  it('passes CommentSchema.parse', () => {
    const result = transformComment(raw)
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  it('throws instead of inventing createdAt when created_at is absent', () => {
    expect(() => transformComment({ id: 'p1', message: 'hi', user_id: 'u1' })).toThrow(/created_at/)
  })

  it('throws instead of inventing authorId when user_id is absent', () => {
    const { user_id: _omit, ...rest } = raw
    expect(() => transformComment(rest)).toThrow(/user_id/)
  })

  it('throws instead of inventing an empty body when message is absent', () => {
    const { message: _omit, ...rest } = raw
    expect(() => transformComment(rest)).toThrow(/message/)
  })

  it('omits attachmentCount when has_attachments is true but attachment_ids was not included', () => {
    const { attachment_ids: _omit, ...rest } = raw
    const result = transformComment(rest)
    expect(result.attachmentCount).toBeUndefined()
    expect(() => CommentSchema.parse(result)).not.toThrow()
  })

  /**
   * The documented example response for `GET /api/v1/posts.json?include=user,attachments`
   * (https://app.mavenlink.com/oas/specification, "Includes" section). The
   * example post elides the Post definition's `created_at` / `updated_at`
   * (type string, format date-time), so the fixture borrows the one timestamp
   * the example does carry, which is the ATTACHMENT's `created_at`
   * (`attachments["6700107"].created_at: "2013-04-15T16:48:48-07:00"`). It is
   * not the post's own documented value.
   */
  it('maps the documented example post and passes CommentSchema.parse', () => {
    const documented: RawKantataPost = {
      id: '16270634',
      message: 'Hello World',
      has_attachments: true,
      user_id: '2',
      workspace_id: '2249167',
      attachment_ids: ['6700107'],
      created_at: '2013-04-15T16:48:48-07:00',
      updated_at: '2013-04-15T16:48:48-07:00',
    }
    const result = CommentSchema.parse(transformComment(documented, '1937928'))
    expect(result).toMatchObject({
      id: '16270634',
      externalId: '16270634',
      taskId: '1937928',
      projectId: '2249167',
      authorId: '2',
      body: 'Hello World',
      attachmentCount: 1,
      createdAt: '2013-04-15T23:48:48.000Z',
      platform: 'kantata',
    })
  })
})
