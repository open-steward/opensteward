import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * ActiveCollab `Comment` object (subset).
 *
 * Comments are polymorphic via `parent_type` / `parent_id` (e.g. a comment
 * on a `Task`). `attachments` is an array of attachment descriptors — only
 * its length is surfaced (attachment CONTENT is refused by the schema).
 * Timestamps are epoch seconds.
 */
export interface RawActivecollabComment {
  id: number | string
  parent_type?: string
  parent_id?: number | string
  body?: string
  body_formatted?: string
  body_plain_text?: string
  created_on?: number | null
  created_by_id?: number | null
  updated_on?: number | null
  attachments?: unknown[]
  is_trashed?: boolean
  url_path?: string
  [key: string]: unknown
}

export function transformComment(
  raw: RawActivecollabComment,
  taskId?: string,
  projectId?: string,
): Comment {
  const parentIsTask = (raw.parent_type ?? '').toLowerCase() === 'task'
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    taskId: taskId ?? (parentIsTask && raw.parent_id != null ? String(raw.parent_id) : undefined),
    projectId,
    authorId: raw.created_by_id != null ? String(raw.created_by_id) : '',
    body: pickStr(raw.body ?? raw.body_plain_text) ?? '',
    mentions: [],
    attachmentCount: Array.isArray(raw.attachments) ? raw.attachments.length : 0,
    createdAt: toIso(raw.created_on) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_on),
    platform: 'activecollab',
    metadata: strMap({ parentType: raw.parent_type, urlPath: raw.url_path }),
    raw,
  }
}
