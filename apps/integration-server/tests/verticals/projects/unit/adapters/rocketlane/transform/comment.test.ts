/**
 * Fixture values are the examples in Rocketlane's published OpenAPI for
 * GET /1.0/comments and GET /1.0/comments/{commentId}
 * (https://developer.rocketlane.com/reference/get-comments).
 */
import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawRocketlaneComment,
} from '../../../../../../../src/verticals/projects/adapters/rocketlane/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

const documented: RawRocketlaneComment = {
  commentId: 201,
  content: 'This is a sample comment',
  createdAt: 1681319726000,
  createdBy: {
    emailId: 'john.doe@rocketlane.com',
    userId: 201,
    firstName: 'John',
    lastName: 'Doe',
  },
  source: { sourceId: 201, sourceType: 'TASK' },
  attachments: [
    {
      attachmentId: 201,
    },
  ],
  private: true,
}

describe('rocketlane transformComment', () => {
  it('maps the documented example and passes CommentSchema.parse', () => {
    const out = CommentSchema.parse(transformComment(documented, '1000000100940'))
    expect(out).toMatchObject({
      id: '201',
      externalId: '201',
      taskId: '201',
      projectId: '1000000100940',
      authorId: '201',
      body: 'This is a sample comment',
      mentions: [],
      attachmentCount: 1,
      createdAt: '2023-04-12T17:15:26.000Z',
      platform: 'rocketlane',
      metadata: { sourceType: 'TASK', sourceId: '201', private: 'true' },
    })
    expect(out.updatedAt).toBeUndefined()
    expect(out.raw).toEqual(documented)
  })

  it('a PROJECT_CONVERSATIONS comment has no taskId', () => {
    const out = CommentSchema.parse(
      transformComment({
        ...documented,
        source: { sourceId: 9, sourceType: 'PROJECT_CONVERSATIONS' },
      }),
    )
    expect(out.taskId).toBeUndefined()
    expect(out.projectId).toBeUndefined()
    expect(out.metadata['sourceType']).toBe('PROJECT_CONVERSATIONS')
  })

  it('omits attachmentCount when attachments were not requested', () => {
    const { attachments: _a, ...rest } = documented
    const out = CommentSchema.parse(transformComment(rest))
    expect(out.attachmentCount).toBeUndefined()
  })

  it('throws without commentId, createdBy.userId or createdAt', () => {
    expect(() => transformComment({ ...documented, commentId: undefined })).toThrow(/commentId/)
    expect(() => transformComment({ ...documented, createdBy: {} })).toThrow(/createdBy/)
    expect(() => transformComment({ ...documented, createdAt: undefined })).toThrow(/createdAt/)
  })
})
