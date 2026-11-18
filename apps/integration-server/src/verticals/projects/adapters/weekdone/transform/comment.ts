/**
 * Weekdone item comment → canonical Comment.
 *
 * GET /item/<item_id>/comments returns:
 *   { status: 'ok', comments: [{ id, comment, user_id, inserted, ... }] }
 *
 * Weekdone has no single-comment-by-id endpoint — the parent item id is
 * required in the path. To allow getComment() to reconstruct the correct
 * request, the canonical `id` is stored as a composite "{itemId}:{commentId}"
 * string. getComment() splits on ':' to recover both ids.
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawWeekdoneComment {
  id: number | string
  comment?: string
  user_id?: number | string
  inserted?: string
  updated?: string
  [key: string]: unknown
}

export function transformComment(raw: RawWeekdoneComment, taskId?: string): Comment {
  const rawId = String(raw.id)
  // Composite id encodes both the parent item id and the comment id so that
  // getComment() can split on ':' and issue GET /item/<itemId>/comments.
  const id = taskId ? `${taskId}:${rawId}` : rawId
  const userId = raw.user_id != null ? String(raw.user_id) : ''
  return {
    id,
    externalId: rawId,
    taskId,
    projectId: undefined,
    authorId: userId,
    body: pickStr(raw.comment) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.inserted) ?? new Date(0).toISOString(),
    platform: 'weekdone',
    metadata: strMap({}),
    raw,
  }
}
