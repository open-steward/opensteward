/**
 * Fixture fields follow the documented interfaces (Huly publishes no example
 * response): chunter `ChatMessage` over activity `ActivityMessage` and core
 * `AttachedDoc`/`Doc`. `message` is `Markup` (`type Markup = string`); no
 * fetched doc shows how Markup is serialised, so the fixture is an opaque
 * string the transform passes through as stored.
 */
import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawHulyComment,
} from '../../../../../../../src/verticals/projects/adapters/huly/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

function makeRaw(overrides: Partial<RawHulyComment> = {}): RawHulyComment {
  return {
    _id: 'msg-1',
    _class: 'chunter:class:ChatMessage',
    space: 'project-1',
    attachedTo: 'issue-1',
    attachedToClass: 'tracker:class:Issue',
    collection: 'comments',
    message: 'Looks good',
    attachments: 2,
    editedOn: 1700000200000,
    createdBy: 'social-1',
    createdOn: 1700000000000,
    modifiedOn: 1700000100000,
    ...overrides,
  }
}

describe('transformComment', () => {
  it('parses against CommentSchema', () => {
    const c = CommentSchema.parse(transformComment(makeRaw(), 'person-1'))
    expect(c).toMatchObject({
      id: 'msg-1',
      externalId: 'msg-1',
      taskId: 'issue-1',
      authorId: 'person-1',
      body: 'Looks good',
      mentions: [],
      attachmentCount: 2,
      createdAt: '2023-11-14T22:13:20.000Z',
      updatedAt: '2023-11-14T22:16:40.000Z',
      platform: 'huly',
      metadata: { attachedToClass: 'tracker:class:Issue', createdBy: 'social-1' },
    })
  })

  it('the taskId argument wins over attachedTo', () => {
    expect(CommentSchema.parse(transformComment(makeRaw(), 'person-1', 'issue-9')).taskId).toBe(
      'issue-9',
    )
  })

  it('an unedited message has no updatedAt and no attachment count when absent', () => {
    const c = CommentSchema.parse(
      transformComment(makeRaw({ editedOn: undefined, attachments: undefined }), 'person-1'),
    )
    expect(c.updatedAt).toBeUndefined()
    expect(c.attachmentCount).toBeUndefined()
  })

  it('throws instead of inventing an author or a creation time', () => {
    expect(() => transformComment(makeRaw({ createdBy: undefined }), 'person-1')).toThrow(
      /createdBy/,
    )
    expect(() => transformComment(makeRaw({ createdOn: undefined }), 'person-1')).toThrow(
      /createdOn/,
    )
    expect(() => transformComment(makeRaw({ message: undefined }), 'person-1')).toThrow(
      /no message/,
    )
  })
})
