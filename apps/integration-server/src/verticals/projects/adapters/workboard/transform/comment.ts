import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * WorkBoard Comment — a note/update on a goal or metric.
 *
 * WorkBoard does not expose a dedicated public comments endpoint in its v1
 * REST API, but goal/metric update objects and activity records share a
 * common shape. This transform handles whatever comment-shaped payload the
 * API surface may return.
 *
 * Representative fields:
 *   comment_id / id  →  canonical id
 *   body / text / comment  →  comment body
 *   author_id / user_id  →  author
 *   goal_id  →  maps to projectId
 *   metric_id  →  maps to taskId
 *   created_date / created_at  →  createdAt
 */
export interface RawWorkboardComment {
  comment_id?: string | number
  id?: string | number
  body?: string
  text?: string
  comment?: string
  author_id?: string | number
  user_id?: string | number
  goal_id?: string | number
  metric_id?: string | number
  created_date?: string
  created_at?: string
  [key: string]: unknown
}

export function transformComment(
  raw: RawWorkboardComment,
  taskId?: string,
  projectId?: string,
): Comment {
  const id = String(raw.comment_id ?? raw.id ?? '')
  const body = pickStr(raw.body ?? raw.text ?? raw.comment) ?? ''
  const authorId = raw.author_id ?? raw.user_id
  return {
    id,
    externalId: id,
    taskId: taskId ?? (raw.metric_id != null ? String(raw.metric_id) : undefined),
    projectId: projectId ?? (raw.goal_id != null ? String(raw.goal_id) : undefined),
    authorId: authorId != null ? String(authorId) : '',
    body,
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.created_date ?? raw.created_at) ?? new Date(0).toISOString(),
    platform: 'workboard',
    metadata: strMap({}),
    raw,
  }
}
