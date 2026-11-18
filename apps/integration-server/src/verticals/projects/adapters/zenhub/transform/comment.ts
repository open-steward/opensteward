import type { Comment } from '../../../schema'
import { toIso } from './shared'

/**
 * ZenHub issue comment — `Issue.comments` in the public GraphQL schema
 * (https://developers.zenhub.com/schema/zenhub-public-api.graphql):
 *
 *   type Comment implements Node & Timestamps {
 *     author: ZenhubUser!
 *     body: String!
 *     commentable: Commentable!
 *     createdAt: ISO8601DateTime!
 *     editor: ZenhubUser
 *     htmlBody: String!
 *     id: ID!
 *     lastEditedAt: ISO8601DateTime
 *     updatedAt: ISO8601DateTime!
 *   }
 *
 * The adapter selects `id body createdAt updatedAt lastEditedAt author { id }`.
 * The schema has no mentions or attachments field, so `mentions` is empty and
 * `attachmentCount` is omitted.
 */
export interface RawZenhubComment {
  id: string
  body: string
  createdAt: string
  updatedAt?: string
  lastEditedAt?: string | null
  author: { id: string }
  [key: string]: unknown
}

export function transformComment(raw: RawZenhubComment, taskId?: string): Comment {
  const createdAt = toIso(raw.createdAt)
  if (!createdAt) throw new Error(`ZenHub comment ${raw.id} has no createdAt`)
  const updatedAt = toIso(raw.updatedAt)
  const lastEditedAt = toIso(raw.lastEditedAt)
  return {
    id: raw.id,
    externalId: raw.id,
    ...(taskId ? { taskId } : {}),
    authorId: raw.author.id,
    body: raw.body,
    mentions: [],
    createdAt,
    ...(updatedAt ? { updatedAt } : {}),
    platform: 'zenhub',
    metadata: lastEditedAt ? { lastEditedAt } : {},
    raw,
  }
}
