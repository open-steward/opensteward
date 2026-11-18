import type { Comment } from '../../../schema'
import { pickStr, pickNum, strMap, toIso } from './shared'

/**
 * PingCode global comment (`GET /v1/comments?principal_type=work_item&principal_id={id}`).
 *
 * Comments are cross-resource: the same `/v1/comments` endpoint serves work
 * items, test cases, tickets, etc.  We use `principal_type=work_item` and
 * `principal_id` (the task id) when listing task comments.
 *
 * Fields of note:
 *   - `created_by` — a reference object with `id`.
 *   - `attachment_count` — already a count; attachment content is excluded.
 *   - `is_deleted` — soft-delete flag (0/1); deleted comments have an empty
 *     `content` string.
 *
 * Timestamps are 10-digit Unix epoch seconds.
 * Docs: https://open.pingcode.com/  →  General / Comments
 */
export interface RawPingcodeComment {
  id: string
  content?: string
  attachment_count?: number
  attachments?: unknown[]
  created_at?: number | string
  created_by?: { id?: string; name?: string; display_name?: string } | string | null
  is_deleted?: number
  [key: string]: unknown
}

function authorId(raw: RawPingcodeComment): string {
  const cb = raw.created_by
  if (typeof cb === 'string') return pickStr(cb) ?? ''
  if (cb && typeof cb === 'object') return pickStr(cb.id) ?? ''
  return ''
}

export function transformComment(raw: RawPingcodeComment, taskId?: string): Comment {
  return {
    id: raw.id,
    externalId: raw.id,
    taskId: taskId,
    authorId: authorId(raw),
    body: pickStr(raw.content) ?? '',
    mentions: [],
    attachmentCount: pickNum(raw.attachment_count),
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'pingcode',
    metadata: strMap({
      isDeleted: raw.is_deleted,
    }),
    raw,
  }
}
