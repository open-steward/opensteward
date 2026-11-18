import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * A Kantata OX Post. Maps to the canonical `Comment`. A Post belongs to a
 * Workspace and may optionally reference a Story (`story_id`).
 *
 * Associations (`user_id`, `workspace_id`, `story_id`, `attachment_ids`) are
 * only present when the request asks for them via the `include` parameter.
 */
export interface RawKantataPost {
  id: string
  message?: string
  user_id?: string
  workspace_id?: string
  story_id?: string | null
  attachment_ids?: string[]
  has_attachments?: boolean
  reply_count?: number
  private?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformComment(
  raw: RawKantataPost,
  taskId?: string,
  projectId?: string,
): Comment {
  // `user_id` is present when the request includes `user`, and `created_at`
  // is a documented Post field. Neither has a source to fall back on.
  const authorId = pickStr(raw.user_id)
  if (authorId === undefined) {
    throw new Error(`Kantata post ${raw.id} has no user_id (request it with include=user)`)
  }
  if (typeof raw.message !== 'string') {
    throw new Error(`Kantata post ${raw.id} has no message`)
  }
  const createdAt = toIso(raw.created_at)
  if (createdAt === undefined) {
    throw new Error(`Kantata post ${raw.id} has no valid created_at`)
  }
  return {
    id: raw.id,
    externalId: raw.id,
    taskId: taskId ?? pickStr(raw.story_id ?? undefined),
    projectId: projectId ?? pickStr(raw.workspace_id),
    authorId,
    body: raw.message,
    // The Post documents no mentioned-user ids: mentions exist only inside
    // `formatted_message` ("Sanitized HTML representation of the message with
    // links, user mentions and emoji images."). `recipient_ids` is a private
    // post's audience ("On private posts, the `recipient_ids` array contains
    // the IDs of recipients"), not its mentions, so it is not mapped here.
    mentions: [],
    // `attachment_ids` is only present when `attachments` is included; a post
    // that has attachments but no ids in the response has an unknown count.
    ...(raw.has_attachments === false
      ? { attachmentCount: 0 }
      : Array.isArray(raw.attachment_ids)
        ? { attachmentCount: raw.attachment_ids.length }
        : {}),
    createdAt,
    updatedAt: toIso(raw.updated_at),
    platform: 'kantata',
    metadata: strMap({
      replyCount: raw.reply_count,
      private: raw.private,
    }),
    raw,
  }
}
