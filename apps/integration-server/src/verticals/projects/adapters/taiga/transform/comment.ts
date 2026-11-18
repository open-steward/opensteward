/**
 * Taiga comment transform.
 *
 * Comments are retrieved from GET /history/{type}/{id} where type is one of
 * userstory | task | issue | milestone | wikipage.
 *
 * Each history entry has a `comment` field (non-empty string means it is a
 * comment). Non-comment entries (status changes etc.) are filtered upstream
 * before calling this transform.
 *
 * Docs: https://docs.taiga.io/api.html#history-list
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTaigaComment {
  id: string
  user?: { pk?: number; username?: string } | null
  created_at?: string
  comment?: string
  comment_html?: string
  delete_comment_date?: string | null
  [key: string]: unknown
}

export function transformComment(
  raw: RawTaigaComment,
  taskId?: string,
  projectId?: string,
): Comment {
  return {
    id: raw.id,
    externalId: raw.id,
    taskId,
    projectId,
    authorId: raw.user?.pk != null ? String(raw.user.pk) : '',
    body: pickStr(raw.comment) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'taiga',
    metadata: strMap({
      commentHtml: raw.comment_html,
      deleted: raw.delete_comment_date != null ? 'true' : undefined,
    }),
    raw,
  }
}
