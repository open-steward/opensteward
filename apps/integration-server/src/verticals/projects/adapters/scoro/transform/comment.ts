/**
 * Transform a raw Scoro comment into the canonical Comment schema.
 *
 * Scoro comment key fields (API v2, module: "comments"):
 *   comment_id      – integer identifier
 *   comment         – comment text/HTML content
 *   user_id         – integer ID of the comment author
 *   parent_id       – parent comment ID (for replies)
 *   modified_date   – "YYYY-MM-DD HH:mm:ss"
 *
 * Comments are queried with module + object_id request params;
 * the taskId / projectId are passed in from the caller.
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawScoroComment {
  comment_id?: number | string
  comment?: string
  user_id?: number | string
  parent_id?: number | string | null
  modified_date?: string
  [key: string]: unknown
}

export function transformComment(
  raw: RawScoroComment,
  taskId?: string,
  projectId?: string,
): Comment {
  const id = String(raw.comment_id ?? '')
  return {
    id,
    externalId: id,
    taskId,
    projectId,
    authorId: raw.user_id != null ? String(raw.user_id) : '',
    body: pickStr(raw.comment) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.modified_date) ?? new Date(0).toISOString(),
    platform: 'scoro',
    metadata: strMap({
      parentId: raw.parent_id,
    }),
    raw,
  }
}
