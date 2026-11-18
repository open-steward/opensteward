/**
 * Fixture built from the public schema's `Comment` type
 * (https://developers.zenhub.com/schema/zenhub-public-api.graphql):
 * `author: ZenhubUser!  body: String!  createdAt: ISO8601DateTime!
 * id: ID!  lastEditedAt: ISO8601DateTime  updatedAt: ISO8601DateTime!`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformComment,
  type RawZenhubComment,
} from '../../../../../../../src/verticals/projects/adapters/zenhub/transform/comment'
import { CommentSchema } from '../../../../../../../src/verticals/projects/schema/comment'

describe('zenhub transformComment', () => {
  const raw: RawZenhubComment = {
    id: 'Z2lkOi8vcmFwdG9yL0NvbW1lbnQvMQ',
    body: 'Great work on this!',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-16T11:30:00Z',
    lastEditedAt: null,
    author: { id: 'Z2lkOi8vcmFwdG9yL1plbmh1YlVzZXIvMQ' },
  }

  it('maps the documented fields and parses with CommentSchema', () => {
    const result = CommentSchema.parse(transformComment(raw, 'issue-1'))
    expect(result).toMatchObject({
      id: 'Z2lkOi8vcmFwdG9yL0NvbW1lbnQvMQ',
      externalId: 'Z2lkOi8vcmFwdG9yL0NvbW1lbnQvMQ',
      taskId: 'issue-1',
      authorId: 'Z2lkOi8vcmFwdG9yL1plbmh1YlVzZXIvMQ',
      body: 'Great work on this!',
      mentions: [],
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-16T11:30:00.000Z',
      platform: 'zenhub',
      metadata: {},
    })
  })

  it('invents no attachment count and no project id', () => {
    const result = transformComment(raw, 'issue-1')
    expect(result).not.toHaveProperty('attachmentCount')
    expect(result).not.toHaveProperty('projectId')
  })

  it('carries lastEditedAt in metadata when set', () => {
    const result = CommentSchema.parse(
      transformComment({ ...raw, lastEditedAt: '2024-01-17T09:00:00Z' }, 'issue-1'),
    )
    expect(result.metadata).toEqual({ lastEditedAt: '2024-01-17T09:00:00.000Z' })
  })

  it('throws rather than inventing a createdAt', () => {
    expect(() => transformComment({ ...raw, createdAt: '' }, 'issue-1')).toThrow(/createdAt/)
  })
})
