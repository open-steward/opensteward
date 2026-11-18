/**
 * The fixture is the documented Comment Object example, verbatim:
 * https://developers.smartsuite.com/docs/solution-data/comments/comment-object
 */
import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawSmartsuiteComment,
} from '../../../../../../../src/verticals/projects/adapters/smartsuite/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

const DOC_EXAMPLE: RawSmartsuiteComment = {
  solution: '640a3811c9d3ea77099331e2',
  application: '640a3811c9d3ea77099331e7',
  record: '640a385d0a86e2924f8dd382',
  member: '63a1f65723aaf6bcb564b1f1',
  message: {
    data: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: null },
          content: [{ type: 'text', text: 'test' }],
        },
      ],
    },
    html: '<div class="rendered">\n    <p>test</p>\n</div>',
    preview: 'test',
  },
  parent_comment: null,
  created_on: '2023-03-20T12:49:05.832000Z',
  deleted_on: null,
  updated_on: null,
  reactions: [],
  key: 1,
  assigned_to: null,
  resolved_by: null,
  followers: ['63a1f65723aaf6bcb564b1f1'],
  type: 'comment',
  email: null,
  id: '64185642174d214da05fa9c2',
}

describe('smartsuite transformComment', () => {
  it('parses the documented example with CommentSchema', () => {
    const result = CommentSchema.parse(transformComment(DOC_EXAMPLE))
    expect(result).toMatchObject({
      id: '64185642174d214da05fa9c2',
      externalId: '64185642174d214da05fa9c2',
      taskId: '640a385d0a86e2924f8dd382',
      projectId: '640a3811c9d3ea77099331e2',
      authorId: '63a1f65723aaf6bcb564b1f1',
      body: 'test',
      mentions: [],
      createdAt: '2023-03-20T12:49:05.832Z',
      platform: 'smartsuite',
    })
    expect(result.updatedAt).toBeUndefined()
    expect(result.attachmentCount).toBeUndefined()
  })

  it('reads the author from `member`', () => {
    expect(transformComment({ ...DOC_EXAMPLE, member: 'm2' }).authorId).toBe('m2')
  })

  it('reads the body from message.preview, not the html', () => {
    const r = transformComment({ ...DOC_EXAMPLE, message: { html: '<p>x</p>', preview: 'x' } })
    expect(r.body).toBe('x')
  })

  it('reads createdAt from created_on and updatedAt from updated_on', () => {
    const r = CommentSchema.parse(
      transformComment({ ...DOC_EXAMPLE, updated_on: '2023-03-21T08:00:00.000000Z' }),
    )
    expect(r.createdAt).toBe('2023-03-20T12:49:05.832Z')
    expect(r.updatedAt).toBe('2023-03-21T08:00:00.000Z')
  })

  it('keeps the table, type and parent comment in metadata', () => {
    const r = transformComment({ ...DOC_EXAMPLE, parent_comment: 'c0' })
    expect(r.metadata).toMatchObject({
      application: '640a3811c9d3ea77099331e7',
      type: 'comment',
      parentComment: 'c0',
      key: '1',
    })
  })

  it('throws rather than inventing an author, a body or a creation time', () => {
    const { member: _m, ...noMember } = DOC_EXAMPLE
    expect(() => transformComment(noMember as RawSmartsuiteComment)).toThrow(/member/)
    expect(() => transformComment({ ...DOC_EXAMPLE, message: null })).toThrow(/preview/)
    const { created_on: _c, ...noCreated } = DOC_EXAMPLE
    expect(() => transformComment(noCreated as RawSmartsuiteComment)).toThrow(/created_on/)
  })
})
