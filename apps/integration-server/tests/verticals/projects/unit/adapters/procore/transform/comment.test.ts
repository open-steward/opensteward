/**
 * Fixture: the documented List RFI Replies / Show RFI Reply response example
 * (https://developers.procore.com/api/v1/resource_groups/resource/replies?version=rest_v1.0),
 * with one attachment carrying only the documented example file name.
 */
import { describe, it, expect } from 'vitest'
import {
  transformComment,
  procoreCommentId,
  type RawProcoreRfiReply,
} from '../../../../../../../src/verticals/projects/adapters/procore/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

const raw: RawProcoreRfiReply = {
  id: 999,
  official: true,
  answer_date: '2016-08-29T14:37:22Z',
  plain_text_body: 'No, they need to follow the guidelines on Schedule D',
  rich_text_body: '<p>No, they need to follow the guidelines on Schedule D</p>',
  created_by: 'Jane Doe',
  created_by_id: 42,
  // The spec gives no example for an attachment's id or url; its only example is
  // the name (on the deprecated `filename` duplicate). The transform only counts.
  attachments: [{ name: 'january_receipt_copy.jpg' }],
}

describe('procore transformComment (RFI reply)', () => {
  it('parses with CommentSchema', () => {
    const out = CommentSchema.parse(transformComment(raw, '101', '500'))
    expect(out).toMatchObject({
      id: '500:101:999',
      externalId: '999',
      taskId: '101',
      projectId: '500',
      authorId: '42',
      body: 'No, they need to follow the guidelines on Schedule D',
      mentions: [],
      attachmentCount: 1,
      createdAt: '2016-08-29T14:37:22.000Z',
      platform: 'procore',
    })
    expect(out.updatedAt).toBeUndefined()
  })

  it('id is the projectId:rfiId:replyId getComment reads back', () => {
    expect(transformComment(raw, '101', '500').id).toBe(procoreCommentId('500', '101', '999'))
  })

  it('metadata carries the author name, official flag and RFI id', () => {
    const out = CommentSchema.parse(transformComment(raw, '101', '500'))
    expect(out.metadata).toEqual({ authorName: 'Jane Doe', official: 'true', rfiId: '101' })
  })

  it('omits attachmentCount when attachments is absent', () => {
    const out = CommentSchema.parse(
      transformComment({ ...raw, attachments: undefined }, '101', '500'),
    )
    expect(out.attachmentCount).toBeUndefined()
  })

  it('keeps an empty plain_text_body as an empty body', () => {
    const out = CommentSchema.parse(transformComment({ ...raw, plain_text_body: '' }, '101', '500'))
    expect(out.body).toBe('')
  })

  it('does not read rich_text_body in place of a missing plain_text_body', () => {
    expect(() => transformComment({ ...raw, plain_text_body: undefined }, '101', '500')).toThrow(
      /plain_text_body/,
    )
  })

  it('throws rather than inventing an author when created_by_id is missing', () => {
    expect(() => transformComment({ ...raw, created_by_id: null }, '101', '500')).toThrow(
      /created_by_id/,
    )
  })

  it('throws rather than inventing a creation time when answer_date is missing', () => {
    expect(() => transformComment({ ...raw, answer_date: undefined }, '101', '500')).toThrow(
      /answer_date/,
    )
  })

  it('preserves raw', () => {
    expect(transformComment(raw, '101', '500').raw).toBe(raw)
  })
})
