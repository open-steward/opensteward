import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Plane work item comment.
 * Docs: https://developers.plane.so/api-reference/comment/list-comments
 *
 * `comment_stripped` is the plain-text body; `comment_html` is the rich body.
 * `actor` (falling back to `created_by`) is the author user UUID. Attachment
 * content is refused — only the count is surfaced.
 */
export interface RawPlaneComment {
  id: string
  comment_html?: string
  comment_stripped?: string
  actor?: string | null
  created_by?: string | null
  issue?: string
  project?: string
  workspace?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformComment(
  raw: RawPlaneComment,
  taskId?: string,
  projectId?: string,
): Comment {
  return {
    id: raw.id,
    externalId: raw.id,
    taskId: taskId ?? pickStr(raw.issue),
    projectId: projectId ?? pickStr(raw.project),
    authorId: pickStr(raw.actor) ?? pickStr(raw.created_by) ?? '',
    body: pickStr(raw.comment_stripped) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    platform: 'plane',
    metadata: strMap({}),
    raw,
  }
}
