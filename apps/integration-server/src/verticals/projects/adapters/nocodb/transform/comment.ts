import type { Comment } from '../../../schema'
import { strMap, toIso } from './shared'

/**
 * NocoDB row comment maps to a canonical Comment.
 *
 * Response from GET /api/v2/meta/comments?row_id={rowId}&fk_model_id={tableId}
 * ("List Comments"), whose `list` items are the `Comment` model: `id`,
 * `row_id`, `comment`, `created_by`, `resolved_by`, `parent_comment_id`,
 * `source_id`, `base_id`, `fk_model_id` ("Model ID"), `created_at`,
 * `updated_at` and `attachments` ("Files attached to the comment") (NocoDB's
 * OpenAPI,
 * https://raw.githubusercontent.com/nocodb/nocodb/develop/packages/nocodb/src/schema/swagger-v2.json).
 *
 * The task id is `{fk_model_id}:{row_id}`, the composite listTasks returns.
 * The comment id is `{fk_model_id}:{row_id}:{id}`: the spec has no GET for
 * one comment, so getComment needs the row to read the comment back from.
 * The documented example carries `"created_by": ""`; that value is passed
 * through as is.
 */
export interface RawNocodbComment {
  id?: string
  row_id?: string
  comment?: string
  created_by?: string
  resolved_by?: string | null
  parent_comment_id?: string | null
  source_id?: string | null
  base_id?: string
  fk_model_id?: string
  created_at?: string
  updated_at?: string
  attachments?: unknown[]
  [key: string]: unknown
}

function required(raw: RawNocodbComment, key: 'id' | 'row_id' | 'fk_model_id'): string {
  const v = raw[key]
  if (typeof v !== 'string' || v === '') throw new Error(`NocoDB comment has no ${key}`)
  return v
}

export function transformComment(raw: RawNocodbComment): Comment {
  const id = required(raw, 'id')
  const rowId = required(raw, 'row_id')
  const tableId = required(raw, 'fk_model_id')
  if (typeof raw.created_by !== 'string') {
    throw new Error(`NocoDB comment ${id} has no created_by`)
  }
  if (typeof raw.comment !== 'string') throw new Error(`NocoDB comment ${id} has no comment`)
  const createdAt = toIso(raw.created_at)
  if (!createdAt) throw new Error(`NocoDB comment ${id} has no created_at`)
  const updatedAt = toIso(raw.updated_at)
  // Attachment content (url, path, data) is refused by CommentSchema; only the
  // count is surfaced, so the items stay out of raw too.
  const { attachments: _attachments, ...rest } = raw
  return {
    id: `${tableId}:${rowId}:${id}`,
    externalId: id,
    taskId: `${tableId}:${rowId}`,
    ...(raw.base_id ? { projectId: raw.base_id } : {}),
    authorId: raw.created_by,
    body: raw.comment,
    mentions: [],
    ...(Array.isArray(raw.attachments) ? { attachmentCount: raw.attachments.length } : {}),
    createdAt,
    ...(updatedAt ? { updatedAt } : {}),
    platform: 'nocodb',
    metadata: strMap({
      parentCommentId: raw.parent_comment_id || undefined,
      resolvedBy: raw.resolved_by || undefined,
    }),
    raw: rest,
  }
}
